// Gatekeeper for the SQL lab's "write your own query" editor. It narrows what is accepted;
// the server also runs the query in a READ ONLY transaction with a time limit (see service.mjs).
export const MAX_CUSTOM_ROWS = 500;
export const MAX_CUSTOM_MS = 5000;
const MAX_LENGTH = 8000;

const STRING_LITERAL = /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"/g;
const REFUSED = [
  [/--|\/\*|#/, 'remove comments'],
  [/;/, 'use a single statement'],
  [/\binto\b/i, 'INTO is not allowed'],
  [/\bfor\s+(?:update|share)\b|\block\s+in\s+share\s+mode\b/i, 'locking reads are not allowed'],
  [/\b(?:sleep|benchmark|load_file|get_lock|release_lock|master_pos_wait)\s*\(/i, 'that function is not allowed'],
  [/\b(?:mysql|information_schema|performance_schema|sys)\s*\./i, 'only the project database can be queried'],
];

/** Returns the trimmed query if it is a single read-only SELECT/WITH; otherwise throws "Invalid SQL: ...". */
export function checkReadOnlySql(input) {
  if (typeof input !== 'string') throw new Error('Invalid SQL: expected query text');
  const sql = input.trim().replace(/;\s*$/, '');
  if (!sql) throw new Error('Invalid SQL: enter a query');
  if (sql.length > MAX_LENGTH) throw new Error(`Invalid SQL: keep the query under ${MAX_LENGTH} characters`);
  // Judge the code only: string contents (e.g. LIKE '%;%') and backticks must not trip or hide anything.
  const code = sql.replace(STRING_LITERAL, "''").replaceAll('`', '');
  if (!/^(?:select|with)\b/i.test(code)) throw new Error('Invalid SQL: start with SELECT or WITH');
  for (const [pattern, message] of REFUSED) if (pattern.test(code)) throw new Error(`Invalid SQL: ${message}`);
  return sql;
}
