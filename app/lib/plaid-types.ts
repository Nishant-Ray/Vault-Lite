export type LinkedBankAccount = { id: string; name: string; mask: string; type: 'bank' | 'credit'; balanceCents: number | null };
export type BankConnection = {
  id: string; name: string; status: 'unconfigured' | 'connected'; accounts: LinkedBankAccount[];
  mappings: Record<string, string>; importFrom: string; lastSyncedAt: string | null; error: string | null;
};
export type BankReview = {
  itemId: string; id: string; accountId: string; description: string; amountCents: number; date: string;
  matches: { id: string; description: string; date: string }[];
};
export type BankStatus = { connections: BankConnection[]; review: BankReview[] };
