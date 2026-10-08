export type Account = {
  id: string;
  name: string;
  type: 'bank' | 'credit';
  last4: string;
  balanceCents: number;
  balanceDate: string;
  minimumCents: number;
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
  dueDate: string;
  date: string;
  accountId: string;
  amountCents: number;
};
export const categories = ['Groceries', 'Dining', 'Transportation', 'Shopping', 'Rent', 'Utilities', 'Insurance', 'Medical', 'Entertainment', 'Travel', 'Fitness', 'Misc.'];
