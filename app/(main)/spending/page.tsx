'use client';
import { useState } from 'react';
import { PlusIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import { EntryForm } from '@/app/ui/forms';
import Card from '@/app/ui/card';
import { Breakdown } from '@/app/ui/summary';
import SortableTransactions from '@/app/ui/sortableTransactions';
import { useSpendingOrder } from '@/app/ui/useSpendingOrder';
import { sortSpending, spendingSorts, type SpendingSort } from '@/app/lib/spending-order';
import { categories, type Expense } from '@/app/lib/types';
import { money, today, total } from '@/app/lib/finance';
import BankTransactionInbox from '@/app/ui/bankTransactionInbox';
export default function Spending() {
  const { expenses, remove } = useVault();
  const [year, setYear] = useState(today().slice(0, 4));
  const [month, setMonth] = useState(today().slice(5, 7));
  const [category, setCategory] = useState('all'); const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Expense | null | undefined>(); const [error, setError] = useState('');
  const yearExpenses = expenses.filter(e => e.date.startsWith(year + '-'));
  const { order, ready, saving, error: orderError, setMode, reorder } = useSpendingOrder(year, yearExpenses);
  const filtered = sortSpending(yearExpenses.filter(e => (month === 'all' || e.date.slice(5, 7) === month)
    && (category === 'all' || e.category === category) && e.description.toLowerCase().includes(search.toLowerCase())), order.mode, order.ids);
  const currentYear = Number(today().slice(0, 4));
  const years = [...new Set([year, String(currentYear), String(currentYear - 1), String(currentYear - 2), ...expenses.map(e => e.date.slice(0, 4))])].sort().reverse();
  const months = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: new Date(2000, index, 1).toLocaleDateString('en-US', { month: 'long' }) }));
  const period = month === 'all' ? year : year + '-' + month;
  const periodLabel = month === 'all' ? year : months.find(m => m.value === month)!.label + ' ' + year;
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
    const link = document.createElement('a'); link.href = url; link.download = `vault-spending-${period}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title">Spending</h1><p className="mt-2 text-sm text-off_gray">Every expense, a clearer picture.</p></div><button className="btn" onClick={() => setEdit(null)}><PlusIcon className="h-5 w-5" />Add expense</button></div>
    <BankTransactionInbox />
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <label className="field col-span-2 lg:col-span-1">Month<select aria-label="Month" value={month} onChange={e => setMonth(e.target.value)}><option value="all">All months</option>{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <label className="field">Year<select aria-label="Year" value={year} onChange={e => setYear(e.target.value)} disabled={saving}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
      <label className="field">Category<select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="field col-span-2 lg:col-span-1">Search<input type="search" placeholder="Find an expense" value={search} onChange={e => setSearch(e.target.value)} /></label>
    </div>
    <Card className="mb-6"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-off_gray">My spending · {periodLabel}</p><p className="mt-2 font-display text-3xl font-semibold">{money(total(filtered))}</p><p className="mt-2 text-sm text-off_gray">{filtered.length} expenses · Average {money(filtered.length ? Math.round(total(filtered) / filtered.length) : 0)}</p></div><button className="btn-neutral self-start" onClick={exportCsv} disabled={!filtered.length}><ArrowDownTrayIcon className="mr-2 h-4 w-4" />Export CSV</button></div></Card>
    <div className="mb-6"><Breakdown expenses={filtered} /></div>
    <Card><div className="flex flex-wrap items-end justify-between gap-4 pb-4"><div><h2 className="section-title">Expense history</h2><p className="mt-2 text-xs text-off_gray">Drag a handle to set your own order.</p></div><label className="field w-full sm:w-48">Order<select aria-label="Order" value={order.mode} disabled={!ready || saving} onChange={e => void setMode(e.target.value as SpendingSort)}>{spendingSorts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label></div>{saving && <p className="mt-3 flex items-center gap-2 text-xs text-off_gray" role="status"><span className="h-3 w-3 rounded-full border-2 border-gray-200 border-t-primary motion-safe:animate-spin" aria-hidden="true" />Saving order…</p>}{(error || orderError) && <p role="alert" className="mt-4 text-sm text-red-700">{error || orderError}</p>}<SortableTransactions expenses={filtered} edit={setEdit} remove={deleteExpense} disabled={!ready || saving} onReorder={ids => void reorder(ids)} /></Card>
    {edit !== undefined && <EntryForm kind="expense" item={edit ?? undefined} close={() => setEdit(undefined)} />}
  </>;
}
