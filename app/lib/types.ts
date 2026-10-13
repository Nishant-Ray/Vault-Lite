export type Expense = {
  id: string;
  /** Personal share in cents; negative values are personal refunds. */
  amountCents: number;
  date: string;
  category: string;
  description: string;
  billId?: string;
  billDueDate?: string;
  /** Import provenance only; expenses have no payment-account relationship. */
  plaidTransactionId?: string;
  plaidItemId?: string;
  bankAmountCents?: number;
};
export type BillFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type Bill = {
  id: string;
  amountCents: number;
  dueDate: string;
  category: string;
  name: string;
  paid: boolean;
  frequency?: BillFrequency;
};
export type BillPayment = { expenseId?: string; dueDate: string; date: string; amountCents: number };
export const categories = ['Groceries', 'Dining', 'Transportation', 'Shopping', 'Rent', 'Utilities', 'Insurance', 'Medical', 'Entertainment', 'Travel', 'Fitness', 'Misc.'];
