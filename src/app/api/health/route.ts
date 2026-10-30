import { NextResponse } from 'next/server';
import { publicError, query } from '@/lib/traffic/database.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows=await query('SELECT VERSION() AS mysql_version, DATABASE() AS database_name');
    return NextResponse.json({status:'ok',...rows[0]},{headers:{'Cache-Control':'no-store'}});
  } catch (error: any) {
    console.error('[health]',{code:error.code||'DATABASE_ERROR'});
    return NextResponse.json({status:'unavailable',error:publicError(error)},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
