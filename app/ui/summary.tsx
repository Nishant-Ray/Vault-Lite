import { breakdown, money, total } from '@/app/lib/finance';
import type { Expense } from '@/app/lib/types';
import Card from './card';
export function Breakdown({ expenses }: { expenses: Expense[] }) {
  const sum = total(expenses), rows = breakdown(expenses);
  return <Card><h2 className="section-title">Where your money goes</h2>
    {!rows.length ? <p className="empty">Your breakdown will appear after you add an expense.</p> : <div className="mt-5 space-y-5">{rows.map(row => <div key={row.name}>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{row.name}</span><span className="shrink-0 font-medium">{money(row.cents)} {sum > 0 && row.cents >= 0 && <span className="ml-2 text-xs text-off_gray">{(row.cents / sum * 100).toFixed(0)}%</span>}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary" style={{ width: (sum > 0 ? Math.max(0, Math.min(100, row.cents / sum * 100)) : 0) + '%' }} /></div>
    </div>)}</div>}
  </Card>;
}
