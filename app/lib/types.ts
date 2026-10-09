export type Account = {
  id: string;
  name: string;
  type: 'bank' | 'credit';
  last4: string;
  balanceCents: number;
  balanceDate: string;
  minimumCents: number;
  plaidItemId?: string;
  plaidAccountId?: string;
  plaidBalanceCents?: number;
  plaidBalanceUpdatedAt?: string;
};
export type Expense = {
  id: string;
  accountId: string;
  amountCents: number;
  date: string;
  category: string;
  description: string;
  billId?: string;
  billDueDate?: string;
  plaidTransactionId?: string;
  plaidItemId?: string;
};
export type BillFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type Bill = {
  id: string;
  accountId: string;
  amountCents: number;
  dueDate: string;
  category: string;
  name: string;
  paid: boolean;
  frequency?: BillFrequency;
};
export type BillPayment = {
  expenseId?: string;
  dueDate: string;
  date: string;
  accountId: string;
  amountCents: number;
};
export const categories = ['Groceries', 'Dining', 'Transportation', 'Shopping', 'Rent', 'Utilities', 'Insurance', 'Medical', 'Entertainment', 'Travel', 'Fitness', 'Misc.'];
