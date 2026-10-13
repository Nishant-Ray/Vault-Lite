'use client';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Expense } from '@/app/lib/types';
import { money } from '@/app/lib/finance';
export function TransactionList({ expenses, edit, remove }: { expenses: Expense[]; edit?: (expense: Expense) => void; remove?: (expense: Expense) => void }) {
  if (!expenses.length) return <p className="empty">No expenses here yet. Add your first expense to start tracking.</p>;
  return <ul className="divide-y divide-gray-100">{[...expenses].sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description)).map(e => <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4">
    <div className="min-w-0 flex-1"><p className="truncate font-medium">{e.description}</p><p className="mt-1 text-xs text-off_gray">{e.category}</p><p className="mt-1 text-xs text-off_gray">{new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>{e.bankAmountCents !== undefined && e.bankAmountCents !== e.amountCents && <p className="mt-1 text-xs text-off_gray">Original transaction {money(e.bankAmountCents)} · showing your share</p>}</div>
    <span className="font-semibold tabular-nums">{money(e.amountCents)}</span>
    {e.plaidTransactionId && <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-off_gray">Bank import</span>}
    {(edit || remove) && <div className="flex gap-1">{edit && <button className="icon-btn" aria-label={`Edit ${e.description}`} onClick={() => edit(e)}><PencilSquareIcon className="h-5 w-5" /></button>}{remove && <button className="icon-btn text-red-700" aria-label={`Delete ${e.description}`} onClick={() => remove(e)}><TrashIcon className="h-5 w-5" /></button>}</div>}
  </li>)}</ul>;
}
