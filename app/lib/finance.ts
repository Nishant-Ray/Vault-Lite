import type { Expense } from './types';
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function toCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a valid amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Amount is too large.');
  return cents;
}
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function previousMonth(month: string) {
  const [year, m] = month.split('-').map(Number);
  return `${m === 1 ? year - 1 : year}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
}
export const total = (expenses: Expense[]) => expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
export const filterExpenses = (expenses: Expense[], month: string) => expenses.filter(e => e.date.startsWith(month));
export function breakdown(expenses: Expense[], key: 'category' = 'category') {
  const groups = new Map<string, number>();
  for (const e of expenses) groups.set(e[key], (groups.get(e[key]) ?? 0) + e.amountCents);
  return [...groups].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
}
export function toSignedCents(value: string) {
  return (value.startsWith('-') ? -1 : 1) * toCents(value.replace(/^-/, ''));
}
