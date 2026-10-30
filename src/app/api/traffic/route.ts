import { NextRequest, NextResponse } from 'next/server';
import { parseFilters, toCsv } from '@/lib/traffic/core.mjs';
import { publicError } from '@/lib/traffic/database.mjs';
import { analytics, benchmark, bootstrap, operations, refreshSummary, runSavedQuery, schema, summaries } from '@/lib/traffic/service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: any) {
  const validation=/^(Invalid |Unsupported filter|Unknown saved query|Start date|Filter )/.test(error.message);
  console.error('[traffic-api]', { code:error.code||'REQUEST_ERROR', validation });
  return NextResponse.json({error:validation?error.message:publicError(error)},{status:validation?400:503,headers:{'Cache-Control':'no-store'}});
}
export async function GET(request: NextRequest) {
  try {
    const params=new URLSearchParams(request.nextUrl.searchParams);const action=params.get('action')||'bootstrap';const id=params.get('id')||'';const format=params.get('format');
    for(const key of ['action','id','format'])params.delete(key);
    const filters=parseFilters(params);let data;
    if(action==='bootstrap')data=await bootstrap();
    else if(action==='analytics')data=await analytics(filters);
    else if(action==='schema')data=await schema();
    else if(action==='views')data=await summaries();
    else if(action==='operations')data=await operations(filters);
    else if(action==='query'){
      data=await runSavedQuery(id,filters);
      if(format==='csv')return new NextResponse('\uFEFF'+toCsv(data.rows,data.columns),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="traffic-${id}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }else return NextResponse.json({error:'Unknown action'},{status:400});
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request: NextRequest) {
  try {
    const origin=request.headers.get('origin');
    if(origin&&new URL(origin).host!==request.headers.get('host'))return NextResponse.json({error:'Origin rejected'},{status:403});
    const text=await request.text();if(text.length>16384)return NextResponse.json({error:'Request is too large'},{status:413});
    let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:'Invalid JSON body'},{status:400});}
    const filters=parseFilters(body.filters||{});let data;
    if(body.action==='query')data=await runSavedQuery(body.id,filters);
    else if(body.action==='benchmark')data=await benchmark(filters);
    else if(body.action==='refresh')data=await refreshSummary();
    else return NextResponse.json({error:'Unknown action'},{status:400});
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
