import type { Transaction } from 'plaid';
import type { Expense } from './types';

const categoryMap: Record<string, string> = {
  FOOD_AND_DRINK: 'Dining', GENERAL_MERCHANDISE: 'Shopping', TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel', RENT_AND_UTILITIES: 'Utilities', MEDICAL: 'Medical', ENTERTAINMENT: 'Entertainment',
  PERSONAL_CARE: 'Misc.', HOME_IMPROVEMENT: 'Shopping', GENERAL_SERVICES: 'Misc.', BANK_FEES: 'Misc.',
  GOVERNMENT_AND_NON_PROFIT: 'Misc.',
};
export function bankCategory(transaction: Transaction) {
  const detailed = transaction.personal_finance_category?.detailed ?? '';
  if (detailed.includes('GROCERIES')) return 'Groceries';
  if (detailed.includes('RENT')) return 'Rent';
  if (detailed.includes('INSURANCE')) return 'Insurance';
  if (detailed.includes('GYM') || detailed.includes('FITNESS')) return 'Fitness';
  return categoryMap[transaction.personal_finance_category?.primary ?? ''] ?? 'Misc.';
}
export function isBankSpending(transaction: Transaction) {
  // Deposits, transfers and card statement payments must not become spending.
  // Refunds in purchase categories are negative spending, reducing the total.
  const primary = transaction.personal_finance_category?.primary;
  if (primary && ['TRANSFER_IN', 'TRANSFER_OUT', 'INCOME', 'LOAN_PAYMENTS'].includes(primary)) return false;
  const legacy = transaction.category ?? [];
  if (legacy.some(c => /^(Transfer|Payment|Credit Card|Payroll|Deposit)$/i.test(c))) return false;
  return Boolean(primary && primary in categoryMap);
}
export function bankCents(amount: number) {
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) throw new Error('Invalid bank amount.');
  return cents;
}
export function possibleMatches(expenses: Expense[], accountId: string, amountCents: number, date: string) {
  return expenses.filter(e => !e.plaidTransactionId && e.accountId === accountId && e.amountCents === amountCents
    && Math.abs(Date.parse(`${e.date}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) <= 3 * 86400000);
}
