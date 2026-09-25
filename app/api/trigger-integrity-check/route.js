import { NextResponse } from 'next/server';
import { runIntegrityCheck } from '@/services/integrityService';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const report = await runIntegrityCheck();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      report
    });
  } catch (err) {
    console.error('[API_INTEGRITY_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
