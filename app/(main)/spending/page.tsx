'use client';
import { useState } from 'react';
import { PlusIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import { EntryForm } from '@/app/ui/forms';
import Card from '@/app/ui/card';
import { Breakdown } from '@/app/ui/summary';
import { TransactionList } from '@/app/ui/transactionList';
import { categories, type Expense } from '@/app/lib/types';
import { filterExpenses, money, today, total } from '@/app/lib/finance';
import BankTransactionInbox from '@/app/ui/bankTransactionInbox';
export default function Spending() {
  const { expenses, remove } = useVault();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [category, setCategory] = useState('all'); const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Expense | null | undefined>(); const [error, setError] = useState('');
  const filtered = filterExpenses(expenses, month).filter(e => (category === 'all' || e.category === category) && e.description.toLowerCase().includes(search.toLowerCase()));
  async function deleteExpense(expense: Expense) {
    if (expense.plaidTransactionId) {
      if (!window.confirm(`Remove "${expense.description}" from spending? This transaction will stay ignored on future syncs.${expense.billId ? ' Its bill will become unpaid again.' : ''}`)) return;
      try { await remove('expenses', expense.id); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove bank purchase.'); }
      return;
    }
    if (!window.confirm(`Delete “${expense.description}”?${expense.id.startsWith('bill-') ? ' Its bill will become unpaid again.' : ''}`)) return;
    try { await remove('expenses', expense.id); setError(''); } catch { setError('Could not delete expense. Try again.'); }
  }
  function exportCsv() {
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const rows = [['Date', 'Description', 'Category', 'My share USD', 'Original bank amount USD'], ...filtered.map(e => [e.date, e.description, e.category, (e.amountCents / 100).toFixed(2), e.bankAmountCents === undefined ? '' : (e.bankAmountCents / 100).toFixed(2)])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `vault-spending-${month}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title">Spending</h1><p className="mt-2 text-sm text-off_gray">Every expense, a clearer picture.</p></div><button className="btn" onClick={() => setEdit(null)}><PlusIcon className="h-5 w-5" />Add expense</button></div>
    <BankTransactionInbox />
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <label className="field">Month<input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label>
      <label className="field">Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="field">Search<input type="search" placeholder="Find an expense" value={search} onChange={e => setSearch(e.target.value)} /></label>
    </div>
    <Card className="mb-6"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-off_gray">Total for selected filters</p><p className="mt-2 font-display text-3xl font-semibold">{money(total(filtered))}</p><p className="mt-2 text-sm text-off_gray">{filtered.length} expenses · Average {money(filtered.length ? Math.round(total(filtered) / filtered.length) : 0)}</p></div><button className="btn-neutral self-start" onClick={exportCsv} disabled={!filtered.length}><ArrowDownTrayIcon className="mr-2 h-4 w-4" />Export CSV</button></div></Card>
    <div className="mb-6"><Breakdown expenses={filtered} /></div>
    <Card><h2 className="section-title">Expense history</h2>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<TransactionList expenses={filtered} edit={setEdit} remove={deleteExpense} /></Card>
    {edit !== undefined && <EntryForm kind="expense" item={edit ?? undefined} close={() => setEdit(undefined)} />}
  </>;
}
