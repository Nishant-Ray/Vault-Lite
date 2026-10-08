'use client';
import { useState } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import { AccountSelect, BillPaymentForm, EntryForm } from '@/app/ui/forms';
import Card from '@/app/ui/card';
import { TransactionList } from '@/app/ui/transactionList';
import { billScheduleLabel, monthlyBillEstimate, nextBillPayment } from '@/app/lib/bills';
import { accountLabel, money, today } from '@/app/lib/finance';
import type { Bill } from '@/app/lib/types';

export default function Bills() {
  const { bills, expenses, accounts, remove } = useVault();
  const [accountId, setAccountId] = useState('all'); const [status, setStatus] = useState('upcoming');
  const [edit, setEdit] = useState<Bill | null | undefined>();
  const [payment, setPayment] = useState<{ bill: Bill; dueDate: string } | null>(null);
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const accountBills = bills.filter(b => accountId === 'all' || b.accountId === accountId);
  const schedules = accountBills.map(bill => ({ bill, dueDate: nextBillPayment(bill, expenses) }));
  const upcoming = schedules.filter(entry => entry.dueDate !== null);
  const filtered = (status === 'all' ? schedules : upcoming).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const history = expenses.filter(e => (e.billId || e.id.startsWith('bill-')) && (accountId === 'all' || e.accountId === accountId));
  const monthly = upcoming.reduce((sum, { bill }) => sum + monthlyBillEstimate(bill), 0);
  const overdue = upcoming.filter(entry => entry.dueDate! < today());

  async function deleteBill(bill: Bill) {
    if (!window.confirm(`Delete ${bill.name} and its future schedule? Recorded payments will remain in Expenses.`)) return;
    setBusy(bill.id); setError('');
    try { await remove('bills', bill.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete bill.'); }
    finally { setBusy(''); }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title">Bills</h1><p className="mt-2 text-sm text-off_gray">Your recurring commitments and upcoming payments.</p></div><button className="btn" onClick={() => setEdit(null)}><PlusIcon className="h-5 w-5" />Add bill</button></div>
    <p className="mb-5 max-w-3xl text-sm leading-relaxed text-off_gray">Set an amount, frequency, and first payment date. Record each payment when it happens; it appears in Expenses and adjusts your account balance. Use Wallet reconciliation for credit-card statement payments to avoid counting purchases twice.</p>
    <div className="mb-6 grid max-w-xl gap-3 sm:grid-cols-2"><label className="field">Payment account<AccountSelect all value={accountId} onChange={setAccountId} /></label><label className="field">View<select value={status} onChange={e => setStatus(e.target.value)}><option value="upcoming">Upcoming & overdue</option><option value="paid">Payment history</option><option value="all">All schedules</option></select></label></div>
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-off_gray">Estimated monthly commitments</p><p className="font-display my-3 text-3xl font-semibold">{money(monthly)}</p><p className="text-xs text-off_gray">Recurring bills only · annualized average</p></Card>
      <Card><p className="text-sm text-off_gray">Next payment for each bill</p><p className="font-display my-3 text-3xl font-semibold">{money(upcoming.reduce((sum, { bill }) => sum + bill.amountCents, 0))}</p><p className="text-xs text-off_gray">{upcoming.length} scheduled payments across all dates</p></Card>
      <Card><p className="text-sm text-off_gray">Overdue schedules</p><p className={`font-display my-3 text-3xl font-semibold ${overdue.length ? 'text-red-700' : ''}`}>{overdue.length}</p><p className="text-xs text-off_gray">Counts each bill’s earliest unpaid payment</p></Card>
    </div>
    {error && <p role="alert" className="notice mb-5">{error}</p>}
    {status === 'paid' ? <Card><h2 className="section-title">Recorded payments</h2><p className="mb-3 mt-2 text-sm text-off_gray">These payments are already included in your spending totals. Manage them in Expenses.</p><TransactionList expenses={history} /></Card> : <Card>
      <h2 className="section-title mb-3">{status === 'all' ? 'All bill schedules' : 'Upcoming & overdue'}</h2>
      {!filtered.length ? <p className="empty">No bills for these filters. Add a recurring bill to plan your next payment.</p> : <ul className="divide-y divide-gray-100">{filtered.map(({ bill, dueDate }) => {
        const account = accounts.find(a => a.id === bill.accountId);
        const recurring = (bill.frequency ?? 'once') !== 'once';
        return <li key={bill.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-medium break-words">{recurring && <ArrowPathIcon className="h-4 w-4 shrink-0 text-primary" />}{bill.name}</p><p className="mt-1 text-xs text-off_gray">{billScheduleLabel(bill)}</p><p className="mt-1 break-words text-xs text-off_gray">{bill.category} · {account ? accountLabel(account) : 'Removed account'}</p><p className={`mt-2 text-xs ${dueDate && dueDate < today() ? 'text-red-700' : 'text-off_gray'}`}>{dueDate ? `${dueDate < today() ? 'Overdue' : 'Next payment'} · ${dueDate}` : 'Paid'}</p></div>
          <div className="text-right"><p className="font-semibold tabular-nums">{money(bill.amountCents)}</p><p className="mt-1 text-xs text-off_gray">per payment</p></div>
          <div className="flex flex-wrap items-center gap-1">
            {dueDate && <button className="btn-neutral" disabled={Boolean(busy)} onClick={() => setPayment({ bill, dueDate })}>Record payment</button>}
            {dueDate && <button className="icon-btn" disabled={Boolean(busy)} aria-label={`Edit ${bill.name}`} onClick={() => setEdit(bill)}><PencilSquareIcon className="h-5 w-5" /></button>}
            <button className="icon-btn text-red-700" disabled={Boolean(busy)} aria-label={`Delete ${bill.name}`} onClick={() => void deleteBill(bill)}><TrashIcon className="h-5 w-5" /></button>
          </div>
        </li>;
      })}</ul>}
    </Card>}
    {edit !== undefined && <EntryForm kind="bill" item={edit ?? undefined} selectedAccount={accountId} close={() => setEdit(undefined)} />}
    {payment && <BillPaymentForm bill={payment.bill} dueDate={payment.dueDate} close={() => setPayment(null)} />}
  </>;
}
