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
};
export type Bill = {
  id: string;
  accountId: string;
  amountCents: number;
  dueDate: string;
  category: string;
  name: string;
  paid: boolean;
};
export const categories = ['Groceries', 'Dining', 'Transportation', 'Shopping', 'Rent', 'Utilities', 'Insurance', 'Medical', 'Entertainment', 'Travel', 'Fitness', 'Misc.'];
