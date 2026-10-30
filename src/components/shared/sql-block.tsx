"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Lightweight SQL syntax highlighter tuned for the academic blue palette.
// Tokenizes keywords, functions, strings, comments, numbers and identifiers.

const KEYWORDS = new Set([
  "SELECT", "FROM", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "ON",
  "WHERE", "GROUP", "BY", "HAVING", "ORDER", "LIMIT", "OFFSET", "AS", "AND",
  "OR", "NOT", "IN", "BETWEEN", "LIKE", "IS", "NULL", "CASE", "WHEN", "THEN",
  "ELSE", "END", "WITH", "RECURSIVE", "UNION", "ALL", "DISTINCT", "CREATE",
  "INDEX", "MATERIALIZED", "VIEW", "REFRESH", "TABLE", "INSERT", "UPDATE",
  "DELETE", "INTO", "VALUES", "SET", "FILTER", "OVER", "PARTITION", "RANGE",
  "ROWS", "DESC", "ASC", "EXPLAIN", "ANALYZE", "CONCURRENTLY",
]);

const FUNCS = new Set([
  "SUM", "AVG", "COUNT", "MIN", "MAX", "ROUND", "RANK", "DENSE_RANK",
  "ROW_NUMBER", "EXTRACT", "DATE", "COALESCE", "CAST", "LAG", "LEAD", "NOW",
]);

function highlight(sql: string): React.ReactNode[] {
  const lines = sql.split("\n");
  return lines.map((line, lineIdx) => {
    // handle full-line comments
    const trimmed = line.trimStart();
    const leading = line.length - trimmed.length;
    if (trimmed.startsWith("--")) {
      return (
        <div key={lineIdx}>
          {" ".repeat(leading)}
          <span style={{ color: "#8aa1b8" }}>{trimmed}</span>
        </div>
      );
    }
    const tokens = line.split(/(\s+|[(),;])/);
    return (
      <div key={lineIdx} className="whitespace-pre-wrap break-words">
        {tokens.map((tok, i) => {
          if (!tok) return null;
          if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
          const upper = tok.toUpperCase().replace(/[(),;]/g, "");
          if (KEYWORDS.has(upper)) {
            return (
              <span key={i} style={{ color: "#17365D", fontWeight: 600 }}>
                {tok}
              </span>
            );
          }
          if (FUNCS.has(upper)) {
            return (
              <span key={i} style={{ color: "#2b6cb0", fontWeight: 600 }}>
                {tok}
              </span>
            );
          }
          if (/^'.*'$/.test(tok) || /^".*"$/.test(tok)) {
            return (
              <span key={i} style={{ color: "#1f7a4d" }}>
                {tok}
              </span>
            );
          }
          if (/^\d+(\.\d+)?$/.test(tok)) {
            return (
              <span key={i} style={{ color: "#9c5b00" }}>
                {tok}
              </span>
            );
          }
          if (tok === "*" || /^[(),;]$/.test(tok)) {
            return (
              <span key={i} style={{ color: "#64748b" }}>
                {tok}
              </span>
            );
          }
          return <span key={i} style={{ color: "#334155" }}>{tok}</span>;
        })}
      </div>
    );
  });
}

interface SqlBlockProps {
  sql: string;
  className?: string;
  maxHeight?: number;
  title?: string;
}

export function SqlBlock({ sql, className, maxHeight, title }: SqlBlockProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[#dbe6f3] bg-[#f5f9fd] overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#dbe6f3] bg-white">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e26f6f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e8b44d]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#5fb571]" />
        {title && (
          <span className="ml-2 text-[11px] font-mono text-[#64748b] uppercase tracking-wide">
            {title}
          </span>
        )}
      </div>
      <pre
        className="p-4 text-[12.5px] leading-relaxed font-mono overflow-auto scroll-thin"
        style={{ maxHeight: maxHeight ?? undefined }}
      >
        <code>{highlight(sql)}</code>
      </pre>
    </div>
  );
}
