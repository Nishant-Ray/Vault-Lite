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
export function bankKind(transaction: Transaction): 'purchase' | 'refund' | 'transfer' | 'income' {
  if (transaction.personal_finance_category?.primary === 'INCOME') return 'income';
  if (!isBankSpending(transaction)) return 'transfer';
  return transaction.amount < 0 ? 'refund' : 'purchase';
}
export function possibleMatches(expenses: Expense[], amountCents: number, date: string) {
  // The logged share can differ from the full charge. Suggest, never auto-match.
  return expenses.filter(e => !e.plaidTransactionId && Math.sign(e.amountCents) === Math.sign(amountCents)
    && Math.abs(Date.parse(`${e.date}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) <= 7 * 86400000)
    .sort((a, b) => Math.abs(a.amountCents - amountCents) - Math.abs(b.amountCents - amountCents));
}
