'use client';
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useVault } from './providers';
import { money, toSignedCents, toCents, today } from '@/app/lib/finance';
import { categories, type Bill, type BillFrequency, type Expense } from '@/app/lib/types';
import { billFrequencies, billScheduleLabel } from '@/app/lib/bills';
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current; dialog?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className="modal" onCancel={close} aria-labelledby="modal-title" onClick={event => { if (event.target === event.currentTarget) close(); }}><div className="p-5 sm:p-7"><div className="mb-6 flex items-center justify-between gap-4"><h2 id="modal-title" className="text-xl font-semibold">{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={close}><XMarkIcon className="h-5 w-5" /></button></div>{children}</div></dialog>;
}
export function EntryForm({ kind, item, close }: { kind: 'expense' | 'bill'; item?: Expense | Bill; close: () => void }) {
  const { save } = useVault();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const bill = item && 'dueDate' in item ? item : undefined;
  const expense = item && 'date' in item ? item : undefined;
  const [frequency, setFrequency] = useState<BillFrequency>(bill?.frequency ?? (kind === 'bill' && !item ? 'monthly' : 'once'));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const amountCents = kind === 'expense' ? toSignedCents(String(data.get('amount'))) : toCents(String(data.get('amount')));
      if (amountCents === 0 && !expense?.plaidTransactionId) throw new Error('Enter an amount other than zero.');
      const common = { id: item?.id ?? crypto.randomUUID(), amountCents, category: String(data.get('category')) };
      if (kind === 'expense') await save('expenses', { ...expense, ...common, date: String(data.get('date')), description: String(data.get('description')).trim() });
      else await save('bills', { ...common, dueDate: String(data.get('date')), name: String(data.get('description')).trim(), paid: frequency === 'once' ? bill?.paid ?? false : false, frequency });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please try again.'); }
    finally { setBusy(false); }
  }
  return <Modal close={close} title={(item ? 'Edit' : 'Add') + ' ' + kind}><form onSubmit={submit} className="space-y-4">
    <label className="field">{kind === 'bill' ? 'Bill name' : 'Description'}<input name="description" maxLength={200} required pattern=".*\S.*" defaultValue={expense?.description ?? bill?.name} placeholder={kind === 'bill' ? 'Electricity bill' : 'My share of dinner'} autoFocus /></label>
    {kind === 'bill' && <label className="field">Payment frequency<select value={frequency} onChange={e => setFrequency(e.target.value as BillFrequency)}>{billFrequencies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>}
    <div className="grid gap-4 sm:grid-cols-2"><label className="field">{kind === 'bill' ? 'My share per payment ($)' : 'My share ($)'}<input name="amount" inputMode="decimal" type="number" min={kind === 'bill' ? '0.01' : undefined} step="0.01" required defaultValue={item ? (item.amountCents / 100).toFixed(2) : undefined} placeholder="0.00" /></label>
    <label className="field">{kind === 'bill' ? frequency === 'once' ? 'Payment due date' : 'First scheduled payment' : 'Date'}<input name="date" type="date" required max={kind === 'expense' ? today() : undefined} defaultValue={expense?.date ?? bill?.dueDate ?? today()} /></label></div>
    {kind === 'expense' && <p className="text-sm text-off_gray">{expense?.plaidTransactionId ? 'Original bank amount: ' + money(expense.bankAmountCents ?? expense.amountCents) + '. Only your share counts toward spending. Enter zero to remove it.' : 'Enter only what you personally spent. Use a negative amount for a refund of your own spending; repayments from friends are not refunds.'}</p>}
    {kind === 'bill' && frequency !== 'once' && <p className="text-sm text-off_gray">The first payment date sets the repeating schedule. Shorter months use their last day. Start with your next unpaid payment.</p>}
    <label className="field">Category<select name="category" defaultValue={item?.category ?? categories[0]}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-neutral" onClick={close} disabled={busy}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
  </form></Modal>;
}
export function BillPaymentForm({ bill, dueDate, close }: { bill: Bill; dueDate: string; close: () => void }) {
  const { payBill, expenses } = useVault();
  const [existingId, setExistingId] = useState('');
  const candidates = expenses.filter(e => !e.billId && !e.id.startsWith('bill-') && e.amountCents > 0 && Math.abs(Date.parse(e.date) - Date.parse(dueDate)) <= 14 * 86400000);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const selected = expenses.find(e => e.id === existingId);
      const amountCents = selected?.amountCents ?? toCents(String(data.get('amount')));
      if (amountCents <= 0) throw new Error('Amount must be greater than zero.');
      await payBill(bill, { dueDate, date: selected?.date ?? String(data.get('date')), amountCents, ...(selected ? { expenseId: selected.id } : {}) });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment.'); } finally { setBusy(false); }
  }
  return <Modal title={'Record payment: ' + bill.name} close={close}><form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-off_gray">Scheduled for {dueDate} · {billScheduleLabel(bill)}. Record your share, or use an expense already recorded.</p>
    {!!candidates.length && <label className="field">Use an existing expense<select value={existingId} onChange={e => setExistingId(e.target.value)}><option value="">Record a new expense</option>{candidates.map(e => <option key={e.id} value={e.id}>{e.date} · {e.description} · {money(e.amountCents)}</option>)}</select><span className="text-xs font-normal text-off_gray">Mark this bill paid without counting the expense twice.</span></label>}
    {!existingId && <div className="grid gap-4 sm:grid-cols-2"><label className="field">My share paid ($)<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={(bill.amountCents / 100).toFixed(2)} /></label><label className="field">Date paid<input name="date" type="date" required max={today()} defaultValue={today()} /></label></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" className="btn-neutral" onClick={close} disabled={busy}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</button></div>
  </form></Modal>;
}
