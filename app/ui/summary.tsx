'use client';
import { accountLabel, breakdown, money, total } from '@/app/lib/finance';
import type { Expense } from '@/app/lib/types';
import { useVault } from './providers';
import Card from './card';
export function Breakdown({ expenses, by }: { expenses: Expense[]; by: 'category' | 'accountId' }) {
  const { accounts } = useVault(); const sum = total(expenses);
  const rows = breakdown(expenses, by);
  return <Card><h2 className="section-title">{by === 'category' ? 'Where your money goes' : 'Spending by account'}</h2>
    {!rows.length ? <p className="empty">Your breakdown will appear after you add an expense.</p> : <div className="mt-5 space-y-5">{rows.map(row => <div key={row.name}>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{by === 'category' ? row.name : accounts.find(a => a.id === row.name) ? accountLabel(accounts.find(a => a.id === row.name)!) : 'Removed account'}</span><span className="shrink-0 font-medium">{money(row.cents)} <span className="ml-2 text-xs text-off_gray">{sum ? (row.cents / sum * 100).toFixed(0) : 0}%</span></span></div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary" style={{ width: `${sum ? row.cents / sum * 100 : 0}%` }} /></div>
    </div>)}</div>}
  </Card>;
}
