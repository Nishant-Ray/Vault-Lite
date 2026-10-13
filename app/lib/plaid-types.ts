export type LinkedBankAccount = { id: string; name: string; mask: string; type: 'bank' | 'credit' };
export type BankConnection = {
  id: string; name: string; status: 'unconfigured' | 'connected'; accounts: LinkedBankAccount[];
  selectedAccountIds: string[]; importFrom: string; lastSyncedAt: string | null; error: string | null;
};
export type BankReview = {
  itemId: string; id: string; description: string; amountCents: number; date: string; category: string;
  kind: 'purchase' | 'refund' | 'transfer' | 'income';
  matches: { id: string; description: string; date: string; amountCents: number }[];
};
export type BankStatus = { connections: BankConnection[]; review: BankReview[] };
