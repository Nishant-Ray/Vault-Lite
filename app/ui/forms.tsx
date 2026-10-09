'use client';
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useVault } from './providers';
import { accountBalance, accountLabel, reconciledOpeningBalance, toCents, today } from '@/app/lib/finance';
import { categories, type Account, type Bill, type BillFrequency, type Expense } from '@/app/lib/types';
import { billFrequencies, billScheduleLabel } from '@/app/lib/bills';
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className="modal" onCancel={close} aria-labelledby="modal-title" onClick={event => { if (event.target === event.currentTarget) close(); }}><div className="p-5 sm:p-7"><div className="mb-6 flex items-center justify-between gap-4"><h2 id="modal-title" className="text-xl font-semibold">{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={close}><XMarkIcon className="h-5 w-5" /></button></div>{children}</div></dialog>;
}
export function AccountSelect({ value, onChange, all = false, name = 'accountId', defaultValue }: { value?: string; onChange?: (value: string) => void; all?: boolean; name?: string; defaultValue?: string }) {
  const { accounts } = useVault();
  return <select aria-label="Account" name={name} value={value} defaultValue={defaultValue} onChange={onChange ? e => onChange(e.target.value) : undefined} required={!all}>
    {all ? <option value="all">All accounts & cards</option> : <option value="">Choose an account or card</option>}
    <optgroup label="Credit cards">{accounts.filter(a => a.type === 'credit').map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</optgroup>
    <optgroup label="Bank accounts">{accounts.filter(a => a.type === 'bank').map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</optgroup>
  </select>;
}
export function EntryForm({ kind, item, close, selectedAccount }: { kind: 'expense' | 'bill'; item?: Expense | Bill; close: () => void; selectedAccount?: string }) {
  const { save, accounts } = useVault();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const bill = item && 'dueDate' in item ? item : undefined;
  const expense = item && 'date' in item ? item : undefined;
  const [frequency, setFrequency] = useState<BillFrequency>(bill?.frequency ?? (kind === 'bill' && !item ? 'monthly' : 'once'));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (expense?.plaidTransactionId) {
        await save('expenses', { ...expense, category: String(data.get('category')), description: String(data.get('description')).trim() }); close(); return;
      }
      const amountCents = toCents(String(data.get('amount')));
      if (amountCents <= 0) throw new Error('Amount must be greater than zero.');
      const common = { id: item?.id ?? crypto.randomUUID(), accountId: String(data.get('accountId')), amountCents, category: String(data.get('category')) };
      if (kind === 'expense') await save('expenses', { ...common, date: String(data.get('date')), description: String(data.get('description')).trim() });
      else await save('bills', { ...common, dueDate: String(data.get('date')), name: String(data.get('description')).trim(), paid: frequency === 'once' ? bill?.paid ?? false : false, frequency });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please try again.'); }
    finally { setBusy(false); }
  }
  return <Modal close={close} title={`${item ? 'Edit' : 'Add'} ${kind}`}><form onSubmit={submit} className="space-y-4">
    {!accounts.length && <p className="notice">Add a bank account or credit card in Wallet first.</p>}
    <label className="field">{kind === 'bill' ? 'Bill name' : 'Description'}<input name="description" maxLength={200} required pattern=".*\S.*" defaultValue={expense?.description ?? bill?.name} placeholder={kind === 'bill' ? 'Electricity bill' : 'Weekly groceries'} autoFocus /></label>
    {kind === 'bill' && <label className="field">Payment frequency<select value={frequency} onChange={e => setFrequency(e.target.value as BillFrequency)}>{billFrequencies.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>}
    {expense?.plaidTransactionId ? <p className="text-sm text-off_gray">{expense.date} · {expense.amountCents < 0 ? 'Refund' : 'Bank purchase'} · ${(expense.amountCents / 100).toFixed(2)}. The bank supplies its date, amount, and account; you can change its description and category.</p> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="field">{kind === 'bill' ? 'Amount per payment ($)' : 'Amount ($)'}<input name="amount" inputMode="decimal" type="number" min="0.01" step="0.01" required defaultValue={item ? (item.amountCents / 100).toFixed(2) : undefined} placeholder="0.00" /></label>
    <label className="field">{kind === 'bill' ? frequency === 'once' ? 'Payment due date' : 'First scheduled payment' : 'Date'}<input name="date" type="date" required max={kind === 'expense' ? today() : undefined} defaultValue={expense?.date ?? bill?.dueDate ?? today()} /></label></div>}
    {kind === 'bill' && frequency !== 'once' && <p className="text-sm text-off_gray">The first payment date sets your repeating schedule. Monthly payments use the same day each month, or the last day of a shorter month. Start with your next unpaid payment; you don’t need to enter old payments.</p>}
    {!expense?.plaidTransactionId && <label className="field">Pay with<AccountSelect defaultValue={item?.accountId ?? (selectedAccount === 'all' ? '' : selectedAccount)} /></label>}
    <label className="field">Category<select name="category" defaultValue={item?.category ?? categories[0]}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-neutral" onClick={close} disabled={busy}>Cancel</button><button className="btn" disabled={busy || !accounts.length}>{busy ? 'Saving…' : 'Save'}</button></div>
  </form></Modal>;
}
export function BillPaymentForm({ bill, dueDate, close }: { bill: Bill; dueDate: string; close: () => void }) {
  const { payBill, expenses, accounts } = useVault();
  const [existingId, setExistingId] = useState('');
  const imported = expenses.filter(e => e.plaidTransactionId && !e.billId && e.accountId === bill.accountId && e.amountCents > 0 && Math.abs(Date.parse(e.date) - Date.parse(dueDate)) <= 14 * 86400000);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const selected = expenses.find(e => e.id === existingId);
      const amountCents = selected?.amountCents ?? toCents(String(data.get('amount')));
      if (amountCents <= 0) throw new Error('Amount must be greater than zero.');
      await payBill(bill, { dueDate, date: selected?.date ?? String(data.get('date')), amountCents, accountId: selected?.accountId ?? String(data.get('accountId')), ...(selected ? { expenseId: selected.id } : {}) });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment.'); } finally { setBusy(false); }
  }
  return <Modal title={`Record payment: ${bill.name}`} close={close}><form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-off_gray">Scheduled for {dueDate} · {billScheduleLabel(bill)}. Record a new expense, or use a bank purchase already imported.</p>
    {!!imported.length && <label className="field">Use an imported bank purchase<select value={existingId} onChange={e => setExistingId(e.target.value)}><option value="">Record a new expense</option>{imported.map(e => <option key={e.id} value={e.id}>{e.date} · {e.description} · ${(e.amountCents / 100).toFixed(2)}</option>)}</select><span className="text-xs font-normal text-off_gray">Select the payment to mark this bill paid without counting it twice.</span></label>}
    {accounts.find(a => a.id === bill.accountId)?.plaidItemId && !existingId && <p className="text-sm text-off_gray">If the bank already imported this payment, select it above. New manually recorded payments will be checked for matches on a later bank sync.</p>}
    {!existingId && <><div className="grid gap-4 sm:grid-cols-2"><label className="field">Actual amount ($)<input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" required defaultValue={(bill.amountCents / 100).toFixed(2)} /></label><label className="field">Date paid<input name="date" type="date" required max={today()} defaultValue={today()} /></label></div>
    <label className="field">Paid from<AccountSelect defaultValue={bill.accountId} /></label></>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" className="btn-neutral" onClick={close} disabled={busy}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</button></div>
  </form></Modal>;
}
export function AccountForm({ account, close }: { account?: Account; close: () => void }) {
  const { save, expenses } = useVault(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [type, setType] = useState(account?.type ?? 'bank');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const raw = String(data.get('balance'));
      const enteredBalance = (raw.startsWith('-') ? -1 : 1) * toCents(raw.replace(/^-/, ''));
      // For reconciliation, the user enters the current actual balance.
      // Convert it to today's opening balance so today's expenses aren't
      // deducted (or added to card debt) a second time.
      const balanceCents = account ? reconciledOpeningBalance(account, expenses, enteredBalance) : enteredBalance;
      await save('accounts', { id: account?.id ?? crypto.randomUUID(), name: String(data.get('name')).trim(), type,
        last4: String(data.get('last4')), balanceCents, balanceDate: account ? today() : String(data.get('balanceDate')), minimumCents: toCents(String(data.get('minimum') || '0')) });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save account.'); } finally { setBusy(false); }
  }
  return <Modal title={account ? 'Edit / reconcile account' : 'Add account'} close={close}><form onSubmit={submit} className="space-y-4">
    <label className="field">Account nickname<input autoFocus name="name" maxLength={200} required pattern=".*\S.*" defaultValue={account?.name} placeholder="Chase Sapphire / Main checking" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field">Type<select value={type} onChange={e => setType(e.target.value as Account['type'])} disabled={Boolean(account)}><option value="bank">Bank account</option><option value="credit">Credit card</option></select></label>
    <label className="field">Last 4 digits (optional)<input name="last4" inputMode="numeric" pattern="[0-9]{4}|" maxLength={4} readOnly={Boolean(account?.plaidItemId)} defaultValue={account?.last4} placeholder="1234" /></label></div>
    <label className="field">{account ? type === 'bank' ? 'Current bank balance ($)' : 'Current card amount owed ($)' : type === 'bank' ? 'Opening bank balance ($)' : 'Opening card amount owed ($)'}<input name="balance" type="number" step="0.01" inputMode="decimal" required readOnly={Boolean(account?.plaidItemId)} defaultValue={account ? (accountBalance(account, expenses) / 100).toFixed(2) : '0.00'} /></label>
    {account?.plaidItemId && <p className="text-sm text-off_gray">This balance is supplied by your bank. You can update the nickname and safety buffer; disconnect the bank to resume manual balance tracking.</p>}
    {!account && <label className="field">Opening balance date<input name="balanceDate" type="date" max={today()} required defaultValue={today()} /></label>}
    {!account?.plaidItemId && <p className="text-sm text-off_gray">{account ? 'Enter the balance shown by your bank or card right now. This reconciles today’s balance and keeps all spending history. Expenses you already logged today are accounted for automatically.' : 'Use the balance at the start of this date. Expenses dated on or after it adjust the balance. You can reconcile to your current balance anytime.'}</p>}
    {type === 'bank' && <label className="field">Low balance alert below ($)<input name="minimum" type="number" step="0.01" min="0" defaultValue={account ? (account.minimumCents / 100).toFixed(2) : '200.00'} /></label>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" className="btn-neutral" disabled={busy} onClick={close}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button></div>
  </form></Modal>;
}
