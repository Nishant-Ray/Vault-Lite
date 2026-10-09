import { NextResponse } from 'next/server';
import { admin, ownerUid } from '@/app/lib/server/firebase-admin';
import { secretEquals } from '@/app/lib/server/plaid';
import { syncBank } from '@/app/lib/server/bank-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretEquals(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) return new NextResponse(null, { status: 401 });
  try {
    const uid = ownerUid();
    const items = await admin().db.collection('users').doc(uid).collection('plaidItems').where('status', '==', 'connected').get();
    let synced = 0, failed = 0;
    for (const item of items.docs) {
      try { await syncBank(uid, item.id); synced++; } catch { failed++; }
    }
    return NextResponse.json({ synced, failed }, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Daily bank sync could not run. Check the server configuration.' }, { status: 503 }); }
}
