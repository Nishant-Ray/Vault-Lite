'use client';
import { useState } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import { AccountSelect, EntryForm } from '@/app/ui/forms';
import Card from '@/app/ui/card';
import { money, today } from '@/app/lib/finance';
import type { Bill } from '@/app/lib/types';
export default function Bills() {
  const { bills, accounts, remove, payBill } = useVault();
  const [accountId, setAccountId] = useState('all'); const [status, setStatus] = useState('unpaid');
  const [edit, setEdit] = useState<Bill | null | undefined>(); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const filtered = bills.filter(b => (accountId === 'all' || b.accountId === accountId) && (status === 'all' || b.paid === (status === 'paid'))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  async function action(bill: Bill, kind: 'delete' | 'pay') {
    if (kind === 'delete' && !window.confirm(`Delete ${bill.name}?${bill.paid ? ' Its paid expense will remain in history.' : ''}`)) return;
    setBusy(bill.id); setError('');
    try { if (kind === 'delete') await remove('bills', bill.id); else await payBill(bill); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update bill.'); } finally { setBusy(''); }
  }
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title">Bills</h1><p className="mt-2 text-sm text-off_gray">Keep due dates and payments in sight.</p></div><button className="btn" onClick={() => setEdit(null)}><PlusIcon className="h-5 w-5" />Add bill</button></div>
    <p className="mb-5 text-sm text-off_gray">Marking a bill paid records an expense today using its selected account. Use Wallet reconciliation for credit-card statement payments to avoid counting purchases twice.</p>
    <div className="mb-6 grid max-w-xl gap-3 sm:grid-cols-2"><label className="field">Paying account<AccountSelect all value={accountId} onChange={setAccountId} /></label><label className="field">Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="all">All bills</option></select></label></div>
    {error && <p role="alert" className="notice mb-5">{error}</p>}
    <Card><div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="section-title">{status === 'paid' ? 'Paid bills' : status === 'unpaid' ? 'Upcoming & overdue' : 'All bills'}</h2><span className="text-sm text-off_gray">{money(filtered.reduce((n, b) => n + b.amountCents, 0))} total</span></div>
      {!filtered.length ? <p className="empty">No bills for these filters.</p> : <ul className="divide-y divide-gray-100">{filtered.map(b => <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-5"><div className="min-w-0 flex-1"><p className="font-medium">{b.name}</p><p className="mt-1 text-xs text-off_gray">{b.category} · {accounts.find(a => a.id === b.accountId)?.name ?? 'Removed account'}</p><p className={`mt-1 text-xs ${!b.paid && b.dueDate < today() ? 'text-red-700' : 'text-off_gray'}`}>{b.paid ? 'Paid' : b.dueDate < today() ? 'Overdue' : 'Due'} · {b.dueDate}</p></div><span className="font-semibold tabular-nums">{money(b.amountCents)}</span><div className="flex items-center gap-1">
        {!b.paid && <><button className="btn-neutral" disabled={Boolean(busy)} onClick={() => void action(b, 'pay')}>{busy === b.id ? 'Saving…' : 'Mark paid'}</button><button className="icon-btn" aria-label={`Edit ${b.name}`} onClick={() => setEdit(b)}><PencilSquareIcon className="h-5 w-5" /></button></>}
        <button className="icon-btn text-red-700" disabled={Boolean(busy)} aria-label={`Delete ${b.name}`} onClick={() => void action(b, 'delete')}><TrashIcon className="h-5 w-5" /></button></div></li>)}</ul>}
    </Card>
    {edit !== undefined && <EntryForm kind="bill" item={edit ?? undefined} selectedAccount={accountId} close={() => setEdit(undefined)} />}
  </>;
}
