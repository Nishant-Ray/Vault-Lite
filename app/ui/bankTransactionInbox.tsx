'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { bankRequest } from '@/app/lib/bank-client';
import { money, toSignedCents } from '@/app/lib/finance';
import { categories } from '@/app/lib/types';
import type { BankReview, BankStatus } from '@/app/lib/plaid-types';
import { useVault } from './providers';
import Card from './card';

export default function BankTransactionInbox() {
  const { user, expenses } = useVault();
  const [status, setStatus] = useState<BankStatus>({ connections: [], review: [] });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const refresh = useCallback(async () => { setStatus(await bankRequest<BankStatus>()); }, []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    bankRequest<BankStatus>().then(data => { if (alive) { setStatus(data); setError(''); } })
      .catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user, expenses]);
  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await bankRequest(body); await refresh(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not review transaction.'); }
    finally { setBusy(false); }
  }
  async function reload() {
    setLoading(true); setError('');
    try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load transactions.'); }
    finally { setLoading(false); }
  }
  if (!loading && !status.connections.length && !error) return null;
  return <Card className="mb-6 rounded-2xl border border-gray-200/80"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Transactions to review{status.review.length ? ' (' + status.review.length + ')' : ''}</h2><button className="btn-neutral gap-2" disabled={busy || loading} onClick={() => void reload()}><ArrowPathIcon className={'h-4 w-4 ' + (loading ? 'motion-safe:animate-spin' : '')} aria-hidden="true" />Refresh</button></div>
    <p className="mt-2 text-sm text-off_gray">Only your confirmed share counts as spending. Ignore reimbursements and transfers between your own accounts.</p>
    {error && <p className="notice mt-4" role="alert">{error}</p>}{message && <p className="mt-4 text-sm text-green-800" role="status">{message}</p>}
    {loading ? <div className="mt-5 space-y-3" role="status" aria-label="Loading bank transactions"><span className="sr-only">Loading bank transactions</span><div aria-hidden="true" className="bank-skeleton h-5 w-48 rounded-full" /><div aria-hidden="true" className="bank-skeleton h-20 w-full rounded-xl" /></div> : status.review.length ? <><p className="mt-3 text-xs text-off_gray">Up to 100 transactions per bank at a time.</p><ul className="mt-4 divide-y divide-gray-100">{status.review.map(row => <ReviewRow key={row.itemId + '-' + row.id} row={row} busy={busy} act={act} />)}</ul></> : !error && <p className="empty">You're all caught up.</p>}
  </Card>;
}
function ReviewRow({ row, busy, act }: { row: BankReview; busy: boolean; act: (body: Record<string, unknown>, message: string) => Promise<void> }) {
  const [matchId, setMatchId] = useState('');
  const [share, setShare] = useState(row.kind === 'transfer' || row.kind === 'income' ? '0.00' : (row.amountCents / 100).toFixed(2));
  const [category, setCategory] = useState(row.category);
  const [error, setError] = useState('');
  async function review(decision: string) {
    setError('');
    try {
      const amountCents = decision === 'import' ? toSignedCents(share) : undefined;
      await act({ action: 'review', itemId: row.itemId, transactionId: row.id, decision, matchId, amountCents, category }, 'Transaction reviewed.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Enter a valid share.'); }
  }
  const kindLabel = row.kind === 'transfer' ? row.amountCents < 0 ? 'Incoming transfer' : 'Outgoing transfer' : row.kind === 'income' ? 'Money received' : row.kind === 'refund' ? 'Refund' : 'Purchase';
  return <li className="space-y-3 py-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{row.description}</p><p className="mt-1 text-xs text-off_gray">{row.date} · {kindLabel}</p></div><div className="shrink-0 text-right"><span className="font-semibold">{money(row.amountCents)}</span><p className="mt-1 text-xs text-off_gray">Bank amount</p></div></div>
    {(row.kind === 'transfer' || row.kind === 'income') && <p className="text-xs text-off_gray">Ignore repayments received and transfers between your accounts. If you paid someone for your own purchase, add that share as spending.</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="field">My share ($)<input type="number" step="0.01" inputMode="decimal" value={share} onChange={e => setShare(e.target.value)} aria-label={'My share for ' + row.description} /></label><label className="field">Category<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
    {!!row.matches.length && <label className="field">Already recorded this?<select value={matchId} onChange={e => setMatchId(e.target.value)}><option value="">Choose an existing expense</option>{row.matches.map(m => <option key={m.id} value={m.id}>{m.date} · {m.description} · {money(m.amountCents)}</option>)}</select><span className="text-xs font-normal text-off_gray">Matching preserves that expense's personal share, even if the bank amount is different.</span></label>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className="btn" disabled={busy || !share || Number(share) === 0} onClick={() => void review('import')}>Add my share</button>{!!row.matches.length && <button className="btn-neutral" disabled={busy || !matchId} onClick={() => void review('match')}>Match expense</button>}<button className="btn-neutral" disabled={busy} onClick={() => void review('ignore')}>Ignore</button></div>
  </li>;
}
