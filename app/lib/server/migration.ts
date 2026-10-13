import 'server-only';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { admin } from './firebase-admin';
import { withBankLease } from './bank-service';
import { bankId } from './plaid';
import type { LinkedBankAccount } from '../plaid-types';

export async function exportLegacyData(uid: string) {
  const root = admin().db.collection('users').doc(uid);
  const names = ['accounts', 'expenses', 'bills'] as const;
  const snapshots = await Promise.all(names.map(name => root.collection(name).get()));
  return { version: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(names.map((name, index) =>
    [name, snapshots[index].docs.map(d => ({ ...d.data(), id: d.id }))])) };
}
export async function migratePersonalSpending(uid: string) {
  const { db } = admin(), root = db.collection('users').doc(uid);
  let expenses = 0, bills = 0, connections = 0;
  const items = await root.collection('plaidItems').get();
  const locked: { ref: DocumentReference; accounts: LinkedBankAccount[]; ids: string[] }[] = [];
  // Acquire every connection before editing any ledger data. In particular,
  // an in-flight sync from the old deployment must finish before migration.
  async function acquire(index: number): Promise<{ expenses: number; bills: number; connections: number; message: string }> {
    if (index < items.docs.length) {
      return withBankLease(items.docs[index].ref, async item => {
        locked.push({ ref: items.docs[index].ref, accounts: item.accounts, ids: item.selectedAccountIds ?? Object.keys(item.mappings ?? {}) });
        try { return await acquire(index + 1); } finally { locked.pop(); }
      });
    }
    return migrate();
  }
  async function migrate() {
    // Only remove account relationships. Preserve every personal amount, bill
    // occurrence, payment ID, import decision, token and sync cursor.
    for (const name of ['expenses', 'bills'] as const) {
      const snapshot = await root.collection(name).get();
      for (const doc of snapshot.docs) {
        const changed = await db.runTransaction(async tx => {
          const data = (await tx.get(doc.ref)).data();
          if (!data) return;
          const changes: Record<string, unknown> = {};
          if ('accountId' in data) changes.accountId = FieldValue.delete();
          if (name === 'expenses' && data.plaidTransactionId && data.bankAmountCents === undefined) {
            const rowRef = typeof data.plaidItemId === 'string' && /^[a-f0-9]{64}$/.test(data.plaidItemId)
              ? root.collection('plaidItems').doc(data.plaidItemId).collection('transactions').doc(bankId(data.plaidTransactionId)) : null;
            const row = rowRef ? await tx.get(rowRef) : null;
            changes.bankAmountCents = row?.data()?.amountCents ?? data.amountCents;
          }
          if (Object.keys(changes).length) { tx.update(doc.ref, changes); return true; }
          return false;
        });
        if (changed) { if (name === 'expenses') expenses++; else bills++; }
      }
    }
    for (const item of locked) {
        const accounts = item.accounts.map(a => ({ id: a.id, name: a.name, mask: a.mask, type: a.type }));
        await item.ref.update({ accounts, selectedAccountIds: item.ids, mappings: FieldValue.delete() });
        const rows = await item.ref.collection('transactions').get();
        const legacy = rows.docs.filter(d => 'accountId' in d.data() || 'matches' in d.data());
        for (let start = 0; start < legacy.length; start += 400) {
          const batch = db.batch();
          legacy.slice(start, start + 400).forEach(d => batch.update(d.ref, { accountId: FieldValue.delete(), matches: FieldValue.delete() }));
          await batch.commit();
        }
        connections++;
    }
    await root.set({ spendingModelVersion: 2 }, { merge: true });
    return { expenses, bills, connections, message: 'Migration complete. History and bank links were preserved. You can delete the old accounts collection in Firebase.' };
  }
  return acquire(0);
}
