import type { Account, Expense } from './types';
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
export const filterExpenses = (expenses: Expense[], month: string, accountId = 'all') => expenses.filter(e => e.date.startsWith(month) && (accountId === 'all' || e.accountId === accountId));
export function breakdown(expenses: Expense[], key: 'category' | 'accountId') {
  const groups = new Map<string, number>();
  for (const e of expenses) groups.set(e[key], (groups.get(e[key]) ?? 0) + e.amountCents);
  return [...groups].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
}
// The reconciled balance is the opening balance for this date; all expenses on
// or after it count. Earlier expenses remain in spending reports only.
export function accountBalance(account: Account, expenses: Expense[]) {
  // Bank snapshots already include purchases, transfers and card payments.
  // Never apply local expenses to them again.
  if (account.plaidItemId && account.plaidBalanceCents !== undefined) return account.plaidBalanceCents;
  const spent = total(expenses.filter(e => e.accountId === account.id && e.date >= account.balanceDate && e.date <= today()));
  return account.balanceCents + (account.type === 'bank' ? -spent : spent);
}
export function reconciledOpeningBalance(account: Account, expenses: Expense[], currentBalanceCents: number) {
  const todaySpent = total(expenses.filter(e => e.accountId === account.id && e.date === today()));
  return currentBalanceCents + (account.type === 'bank' ? todaySpent : -todaySpent);
}
export const accountLabel = (account: Account) => `${account.name}${account.last4 ? ` • ${account.last4}` : ''} (${account.type === 'credit' ? 'Credit card' : 'Bank'})`;
