import { NextResponse } from 'next/server';
import { ApiError, requireOwner } from '@/app/lib/server/firebase-admin';
import { safeBankError } from '@/app/lib/server/plaid';
import { bankStatus, configureBank, createBankLink, disconnectBank, editImportedExpense, exchangeBank, ignoreImportedExpense, linkBankBillPayment, resumeBankLink, reviewBankTransaction, syncBank } from '@/app/lib/server/bank-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => json({ error: safeBankError(e) }, e instanceof ApiError ? e.status : 502);
export async function GET(request: Request) {
  try { return json(await bankStatus(await requireOwner(request))); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const uid = await requireOwner(request);
    if (Number(request.headers.get('content-length') ?? 0) > 10000) throw new ApiError('Request is too large.');
    const body = await request.json().catch(() => { throw new ApiError('Invalid request.'); });
    if (!body || typeof body !== 'object') throw new ApiError('Invalid request.');
    switch (body.action) {
      case 'link': return json(await createBankLink(uid, body.itemId));
      case 'resume': return json(await resumeBankLink(uid));
      case 'exchange': return json(await exchangeBank(uid, body.publicToken));
      case 'configure': await configureBank(uid, body.itemId, body.mappings, body.importFrom); return json({ ok: true });
      case 'sync': return json(await syncBank(uid, body.itemId));
      case 'disconnect': await disconnectBank(uid, body.itemId); return json({ ok: true });
      case 'review': await reviewBankTransaction(uid, body.itemId, body.transactionId, body.decision, body.matchId); return json({ ok: true });
      case 'ignore-expense': await ignoreImportedExpense(uid, body.expenseId); return json({ ok: true });
      case 'edit-expense': await editImportedExpense(uid, body.expenseId, body.description, body.category); return json({ ok: true });
      case 'link-bill': await linkBankBillPayment(uid, body.billId, body.dueDate, body.expenseId); return json({ ok: true });
      default: throw new ApiError('Unknown bank request.');
    }
  } catch (e) { return failure(e); }
}
