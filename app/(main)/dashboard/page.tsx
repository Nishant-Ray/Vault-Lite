'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PlusIcon, ArrowUpRightIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import { EntryForm } from '@/app/ui/forms';
import Card from '@/app/ui/card';
import SpendingGraph from '@/app/ui/spendingGraph';
import { Breakdown } from '@/app/ui/summary';
import { TransactionList } from '@/app/ui/transactionList';
import { filterExpenses, money, previousMonth, today, total } from '@/app/lib/finance';
import { nextBillPayment } from '@/app/lib/bills';
export default function Dashboard() {
  const { expenses, bills } = useVault();
  const [month, setMonth] = useState(today().slice(0, 7)); const [add, setAdd] = useState(false);
  const filtered = filterExpenses(expenses, month); const sum = total(filtered);
  const prev = total(filterExpenses(expenses, previousMonth(month)));
  const upcoming = bills.flatMap(bill => {
    const dueDate = nextBillPayment(bill, expenses);
    return dueDate ? [{ ...bill, dueDate }] : [];
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return <>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-sm text-off_gray">A clear view of your finances</p><h1 className="page-title">Your money, at a glance.</h1></div><button className="btn" onClick={() => setAdd(true)}><PlusIcon className="h-5 w-5" />Add expense</button></div>
    <div className="mb-6 max-w-xs"><label className="field">Month<input type="month" aria-label="Month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label></div>
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Card><p className="text-sm text-off_gray">My monthly spending</p><p className="my-3 font-display text-3xl font-semibold tabular-nums">{money(sum)}</p><p className="text-xs text-off_gray">{prev > 0 ? `${Math.abs((sum - prev) / prev * 100).toFixed(1)}% ${sum >= prev ? 'more' : 'less'} than previous month` : 'No spending in the previous month'}</p></Card>
      <Card><p className="text-sm text-off_gray">Previous month</p><p className="my-3 font-display text-3xl font-semibold tabular-nums">{money(prev)}</p><p className="text-xs text-off_gray">Your personal share, including refunds</p></Card>
      <Card><p className="text-sm text-off_gray">Expenses this month</p><p className="my-3 font-display text-3xl font-semibold tabular-nums">{filtered.length}</p><p className="text-xs text-off_gray">Average {money(filtered.length ? Math.round(sum / filtered.length) : 0)} per expense</p></Card>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card><h2 className="section-title">Spending through {month.slice(0, 4)}</h2><SpendingGraph expenses={expenses} year={month.slice(0, 4)} /></Card>
      <Breakdown expenses={filtered} />
      <Card><div className="flex items-center justify-between"><h2 className="section-title">Recent expenses</h2><Link className="icon-btn" href="/spending" aria-label="View all expenses"><ArrowUpRightIcon className="h-5 w-5" /></Link></div><TransactionList expenses={[...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)} /></Card>
      <Card><div className="flex items-center justify-between"><h2 className="section-title">Unpaid bills</h2><Link className="icon-btn" href="/bills" aria-label="View all bills"><ArrowUpRightIcon className="h-5 w-5" /></Link></div>{upcoming.length ? <ul className="divide-y divide-gray-100">{upcoming.slice(0, 5).map(b => <li className="flex justify-between gap-3 py-4" key={b.id}><div><p className="font-medium">{b.name}</p><p className={`mt-1 text-xs ${b.dueDate < today() ? 'text-red-700' : 'text-off_gray'}`}>{b.dueDate < today() ? 'Overdue · ' : 'Due · '}{b.dueDate}</p></div><span className="font-semibold">{money(b.amountCents)}</span></li>)}</ul> : <p className="empty">You’re all caught up.</p>}</Card>
    </div>
    {add && <EntryForm kind="expense" close={() => setAdd(false)} />}
  </>;
}
