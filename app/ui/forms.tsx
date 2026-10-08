'use client';
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useVault } from './providers';
import { accountBalance, accountLabel, reconciledOpeningBalance, toCents, today } from '@/app/lib/finance';
import { categories, type Account, type Bill, type Expense } from '@/app/lib/types';
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const amountCents = toCents(String(data.get('amount')));
      if (amountCents <= 0) throw new Error('Amount must be greater than zero.');
      const common = { id: item?.id ?? crypto.randomUUID(), accountId: String(data.get('accountId')), amountCents, category: String(data.get('category')) };
      if (kind === 'expense') await save('expenses', { ...common, date: String(data.get('date')), description: String(data.get('description')).trim() });
      else await save('bills', { ...common, dueDate: String(data.get('date')), name: String(data.get('description')).trim(), paid: bill?.paid ?? false });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please try again.'); }
    finally { setBusy(false); }
  }
  return <Modal close={close} title={`${item ? 'Edit' : 'Add'} ${kind}`}><form onSubmit={submit} className="space-y-4">
    {!accounts.length && <p className="notice">Add a bank account or credit card in Wallet first.</p>}
    <label className="field">{kind === 'bill' ? 'Bill name' : 'Description'}<input name="description" maxLength={200} required pattern=".*\S.*" defaultValue={expense?.description ?? bill?.name} placeholder={kind === 'bill' ? 'Electricity bill' : 'Weekly groceries'} autoFocus /></label>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="field">Amount ($)<input name="amount" inputMode="decimal" type="number" min="0.01" step="0.01" required defaultValue={item ? (item.amountCents / 100).toFixed(2) : undefined} placeholder="0.00" /></label>
    <label className="field">{kind === 'bill' ? 'Due date' : 'Date'}<input name="date" type="date" required max={kind === 'expense' ? today() : undefined} defaultValue={expense?.date ?? bill?.dueDate ?? today()} /></label></div>
    <label className="field">Pay with<AccountSelect defaultValue={item?.accountId ?? (selectedAccount === 'all' ? '' : selectedAccount)} /></label>
    <label className="field">Category<select name="category" defaultValue={item?.category ?? categories[0]}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-neutral" onClick={close} disabled={busy}>Cancel</button><button className="btn" disabled={busy || !accounts.length}>{busy ? 'Saving…' : 'Save'}</button></div>
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
    <label className="field">Last 4 digits (optional)<input name="last4" inputMode="numeric" pattern="[0-9]{4}|" maxLength={4} defaultValue={account?.last4} placeholder="1234" /></label></div>
    <label className="field">{account ? type === 'bank' ? 'Current bank balance ($)' : 'Current card amount owed ($)' : type === 'bank' ? 'Opening bank balance ($)' : 'Opening card amount owed ($)'}<input name="balance" type="number" step="0.01" inputMode="decimal" required defaultValue={account ? (accountBalance(account, expenses) / 100).toFixed(2) : '0.00'} /></label>
    {!account && <label className="field">Opening balance date<input name="balanceDate" type="date" max={today()} required defaultValue={today()} /></label>}
    <p className="text-sm text-off_gray">{account ? 'Enter the balance shown by your bank or card right now. This reconciles today’s balance and keeps all spending history. Expenses you already logged today are accounted for automatically.' : 'Use the balance at the start of this date. Expenses dated on or after it adjust the balance. You can reconcile to your current balance anytime.'}</p>
    {type === 'bank' && <label className="field">Low balance alert below ($)<input name="minimum" type="number" step="0.01" min="0" defaultValue={account ? (account.minimumCents / 100).toFixed(2) : '200.00'} /></label>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" className="btn-neutral" disabled={busy} onClick={close}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button></div>
  </form></Modal>;
}
