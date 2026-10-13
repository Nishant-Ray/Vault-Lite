import 'server-only';
import { randomUUID } from 'node:crypto';
import { FieldValue, type DocumentReference, type Transaction as FirestoreTransaction } from 'firebase-admin/firestore';
import { CountryCode, Products, CreditAccountSubtype, DepositoryAccountSubtype, type AccountBase, type Transaction } from 'plaid';
import { admin, ApiError } from './firebase-admin';
import { bankId, decryptToken, encryptToken, plaid, plaidErrorCode, safeBankError } from './plaid';
import { bankCategory, bankCents, bankKind, possibleMatches } from '../plaid-finance';
import { categories, type Bill, type Expense } from '../types';
import { nextBillPayment } from '../bills';
import type { BankConnection, BankReview, BankStatus, LinkedBankAccount } from '../plaid-types';

type Item = {
  token: string; institutionId: string; name: string; status: 'connected' | 'unconfigured';
  accounts: LinkedBankAccount[]; selectedAccountIds?: string[]; mappings?: Record<string, string>;
  importFrom: string; cursor: string; lastSyncedAt: string | null; error: string | null; environment: string;
  lease?: string; leaseUntil?: number;
};
type BankRow = {
  status: 'review' | 'imported' | 'ignored' | 'removed';
  transactionId: string; amountCents: number; date: string; description: string; category: string;
  kind?: BankReview['kind']; expenseId?: string; matched?: boolean;
};
const environment = () => process.env.PLAID_ENV?.trim() ?? 'sandbox';
const userRef = (uid: string) => admin().db.collection('users').doc(uid);
const itemRef = (uid: string, id: string) => userRef(uid).collection('plaidItems').doc(validKey(id));
const selectedIds = (item: Item) => item.selectedAccountIds ?? Object.keys(item.mappings ?? {});
function validKey(id: string) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new ApiError('Invalid bank connection or transaction.');
  return id;
}
function validDocumentId(id: string) {
  if (typeof id !== 'string' || !id || id.includes('/') || id.length > 200) throw new ApiError('Invalid document.');
  return id;
}
export function checkedDate(value: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z'))
    || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) throw new ApiError('Choose a valid date.');
  return value;
}
function bankAccounts(accounts: AccountBase[]): LinkedBankAccount[] {
  return accounts.filter(a => (a.type === 'credit' && a.subtype === 'credit card')
    || (a.type === 'depository' && ['checking', 'savings', 'money market', 'cash management'].includes(a.subtype ?? '')))
    .filter(a => a.balances.iso_currency_code === 'USD').map(a => ({
      id: a.account_id, name: (a.name || a.official_name || 'Bank account').slice(0, 200),
      mask: /^\d{4}$/.test(a.mask ?? '') ? a.mask! : '', type: a.type === 'credit' ? 'credit' : 'bank',
    }));
}
function publicItem(id: string, item: Item): BankConnection {
  return { id, name: item.name, status: item.status, accounts: item.accounts.map(a => ({ id: a.id, name: a.name, mask: a.mask, type: a.type })),
    selectedAccountIds: selectedIds(item), importFrom: item.importFrom, lastSyncedAt: item.lastSyncedAt, error: item.error };
}
async function getItem(ref: DocumentReference) {
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError('This bank is no longer connected.', 404);
  const item = snapshot.data() as Item;
  if (item.environment !== environment()) throw new ApiError('This connection belongs to a different Plaid environment.');
  return item;
}
export async function bankStatus(uid: string): Promise<BankStatus> {
  const snapshots = await userRef(uid).collection('plaidItems').get();
  const expenses = (await userRef(uid).collection('expenses').get()).docs.map(d => ({ ...d.data(), id: d.id }) as Expense);
  const review: BankReview[] = [];
  for (const item of snapshots.docs) {
    const rows = await item.ref.collection('transactions').where('status', '==', 'review').limit(100).get();
    for (const row of rows.docs) {
      const data = row.data() as BankRow;
      review.push({ itemId: item.id, id: row.id, description: data.description, amountCents: data.amountCents,
        date: data.date, category: data.category, kind: data.kind ?? (data.amountCents < 0 ? 'refund' : 'purchase'),
        matches: possibleMatches(expenses, data.amountCents, data.date).slice(0, 20).map(e => ({ id: e.id, description: e.description, date: e.date, amountCents: e.amountCents })) });
    }
  }
  return { connections: snapshots.docs.map(d => publicItem(d.id, d.data() as Item)), review };
}
export async function createBankLink(uid: string, id?: string) {
  encryptToken('configuration-check');
  const redirect = process.env.PLAID_REDIRECT_URI;
  if (!redirect) throw new ApiError('Set PLAID_REDIRECT_URI before connecting a bank.', 503);
  if (environment() === 'production' && !redirect.startsWith('https://')) throw new ApiError('Plaid Production requires an HTTPS redirect URL. HTTP localhost is only supported in Sandbox.', 503);
  const existing = id ? await getItem(itemRef(uid, id)) : null;
  const response = await plaid().linkTokenCreate({
    user: { client_user_id: uid }, client_name: 'Vault Lite', language: 'en', country_codes: [CountryCode.Us], redirect_uri: redirect,
    ...(existing ? { access_token: decryptToken(existing.token) } : { products: [Products.Transactions], transactions: { days_requested: 90 },
      account_filters: { credit: { account_subtypes: [CreditAccountSubtype.CreditCard] }, depository: { account_subtypes: [DepositoryAccountSubtype.Checking, DepositoryAccountSubtype.Savings, DepositoryAccountSubtype.MoneyMarket, DepositoryAccountSubtype.CashManagement] } } }),
  });
  await userRef(uid).collection('plaidLinkSessions').doc('active').set({ token: response.data.link_token, itemId: id ?? null, expiresAt: response.data.expiration });
  return { token: response.data.link_token };
}
export async function resumeBankLink(uid: string) {
  const session = (await userRef(uid).collection('plaidLinkSessions').doc('active').get()).data();
  if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new ApiError('Bank authorization expired. Connect again.');
  return { token: session.token as string, itemId: session.itemId as string | null };
}
export async function exchangeBank(uid: string, publicToken: string) {
  if (typeof publicToken !== 'string' || publicToken.length > 500 || !publicToken.startsWith('public-')) throw new ApiError('Invalid bank authorization.');
  const client = plaid(), exchange = (await client.itemPublicTokenExchange({ public_token: publicToken })).data;
  const ref = itemRef(uid, bankId(exchange.item_id));
  try {
    const token = encryptToken(exchange.access_token);
    const response = (await client.accountsGet({ access_token: exchange.access_token })).data;
    const institutionId = response.item.institution_id;
    if (!institutionId) throw new ApiError('The bank did not supply an institution identifier.');
    const accounts = bankAccounts(response.accounts);
    if (!accounts.length) throw new ApiError('No supported USD bank or credit-card accounts were shared.');
    const institution = (await client.institutionsGetById({ institution_id: institutionId, country_codes: [CountryCode.Us] })).data.institution;
    const marker = userRef(uid).collection('plaidInstitutions').doc(bankId(institutionId));
    const item: Item = { token, institutionId, name: institution.name.slice(0, 200), accounts, status: 'unconfigured',
      selectedAccountIds: [], importFrom: '', cursor: '', lastSyncedAt: null, error: null, environment: environment() };
    await admin().db.runTransaction(async tx => {
      if ((await tx.get(marker)).exists) throw new ApiError('This bank is already connected. Use Reconnect instead.');
      tx.create(ref, item); tx.create(marker, { itemId: ref.id });
    });
    return publicItem(ref.id, item);
  } catch (error) {
    await client.itemRemove({ access_token: exchange.access_token }).catch(() => undefined);
    throw error;
  }
}
export async function configureBank(uid: string, id: string, accountIds: string[], importFrom: string) {
  checkedDate(importFrom);
  if (!Array.isArray(accountIds) || !accountIds.length || accountIds.some(a => typeof a !== 'string')) throw new ApiError('Select at least one bank source.');
  const ref = itemRef(uid, id), pending = await getItem(ref);
  if (pending.status !== 'unconfigured') throw new ApiError('This bank has already been configured.');
  const accounts = bankAccounts((await plaid().accountsGet({ access_token: decryptToken(pending.token) })).data.accounts);
  if (accountIds.some(id => !accounts.some(a => a.id === id))) throw new ApiError('Invalid bank source.');
  await admin().db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data() as Item | undefined;
    if (!item || item.status !== 'unconfigured') throw new ApiError('This connection changed. Refresh Accounts.');
    tx.update(ref, { accounts, selectedAccountIds: [...new Set(accountIds)], importFrom, status: 'connected', mappings: FieldValue.delete() });
  });
}
export async function withBankLease<T>(ref: DocumentReference, work: (item: Item) => Promise<T>) {
  const lease = randomUUID();
  const item = await admin().db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new ApiError('Bank connection no longer exists.');
    const data = snapshot.data() as Item;
    if (data.environment !== environment()) throw new ApiError('Wrong Plaid environment for this connection.');
    if ((data.leaseUntil ?? 0) > Date.now()) throw new ApiError('This bank is syncing. Try again shortly.', 409);
    tx.update(ref, { lease, leaseUntil: Date.now() + 360000 }); return data;
  });
  try { return await work(item); }
  finally {
    await admin().db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists && snapshot.data()?.lease === lease) tx.update(ref, { lease: FieldValue.delete(), leaseUntil: FieldValue.delete() });
    });
  }
}
function personalExpense(current: Expense, original: number): Expense {
  return { id: current.id, amountCents: current.amountCents, date: current.date, category: current.category,
    description: current.description, bankAmountCents: original,
    ...(current.plaidTransactionId ? { plaidTransactionId: current.plaidTransactionId, plaidItemId: current.plaidItemId } : {}),
    ...(current.billId ? { billId: current.billId, billDueDate: current.billDueDate } : {}) };
}
async function resetBill(uid: string, tx: FirestoreTransaction, expense: Expense | undefined) {
  const billId = expense?.billId ?? (expense?.id.startsWith('bill-') ? expense.id.slice(5) : undefined);
  const ref = billId ? userRef(uid).collection('bills').doc(billId) : null;
  const bill = ref ? await tx.get(ref) : null;
  return () => { if (ref && bill?.exists && (bill.data()?.frequency ?? 'once') === 'once') tx.update(ref, { paid: false }); };
}
async function applyTransaction(uid: string, ref: DocumentReference, item: Item, transaction: Transaction) {
  if (!selectedIds(item).includes(transaction.account_id)) return;
  const key = bankId(transaction.transaction_id), rowRef = ref.collection('transactions').doc(key);
  const amountCents = bankCents(transaction.amount);
  if (transaction.pending || transaction.date < item.importFrom || amountCents === 0 || transaction.iso_currency_code && transaction.iso_currency_code !== 'USD') return;
  const data: BankRow = { transactionId: transaction.transaction_id, amountCents, date: transaction.date,
    description: (transaction.merchant_name || transaction.name || 'Bank transaction').slice(0, 200),
    category: bankCategory(transaction), kind: bankKind(transaction), status: 'review' };
  await admin().db.runTransaction(async tx => {
    const previous = (await tx.get(rowRef)).data() as BankRow | undefined;
    if (previous?.status === 'ignored') return;
    const expenseRef = previous?.expenseId ? userRef(uid).collection('expenses').doc(previous.expenseId) : null;
    const current = expenseRef ? (await tx.get(expenseRef)).data() as Expense | undefined : undefined;
    if (current?.plaidTransactionId === transaction.transaction_id && expenseRef) {
      // Sync can update the original bank amount, never the user's personal share.
      tx.set(expenseRef, personalExpense(current, amountCents));
      tx.set(rowRef, { ...data, status: 'imported', expenseId: current.id, matched: previous?.matched ?? false });
    } else tx.set(rowRef, data);
  });
}
export async function syncBank(uid: string, id: string) {
  const ref = itemRef(uid, id);
  return withBankLease(ref, async item => {
    if (item.status !== 'connected') throw new ApiError('Choose bank sources first.');
    const client = plaid(), token = decryptToken(item.token);
    try {
      let cursor = item.cursor, transactions: Transaction[] = [], removed: string[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        cursor = item.cursor; transactions = []; removed = [];
        try {
          for (let page = 0; ; page++) {
            if (page >= 100) throw new ApiError('This bank update is too large. Contact Plaid support.');
            const response = (await client.transactionsSync({ access_token: token, cursor: cursor || undefined, count: 500 })).data;
            transactions.push(...response.added, ...response.modified);
            removed.push(...response.removed.map(r => r.transaction_id)); cursor = response.next_cursor;
            if (!response.has_more) break;
          }
          break;
        } catch (e) { if (plaidErrorCode(e) !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt === 2) throw e; }
      }
      const updates = [...new Map(transactions.map(t => [t.transaction_id, t])).values()];
      for (let start = 0; start < updates.length; start += 4) {
        const results = await Promise.allSettled(updates.slice(start, start + 4).map(t => applyTransaction(uid, ref, item, t)));
        const failure = results.find(r => r.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }
      for (const transactionId of removed) {
        const rowRef = ref.collection('transactions').doc(bankId(transactionId));
        await admin().db.runTransaction(async tx => {
          const row = (await tx.get(rowRef)).data() as BankRow | undefined;
          if (!row || row.status === 'ignored' || row.status === 'removed') return;
          const expenseRef = row.expenseId ? userRef(uid).collection('expenses').doc(row.expenseId) : null;
          const expense = expenseRef ? (await tx.get(expenseRef)).data() as Expense | undefined : undefined;
          const reset = !row.matched ? await resetBill(uid, tx, expense) : () => undefined;
          if (expenseRef && expense?.plaidTransactionId === transactionId) {
            if (row.matched) tx.update(expenseRef, { plaidTransactionId: FieldValue.delete(), plaidItemId: FieldValue.delete(), bankAmountCents: FieldValue.delete() });
            else { reset(); tx.delete(expenseRef); }
          }
          tx.update(rowRef, { status: 'removed' });
        });
      }
      const accounts = bankAccounts((await client.accountsGet({ access_token: token })).data.accounts);
      await ref.update({ cursor, accounts, selectedAccountIds: selectedIds(item), mappings: FieldValue.delete(), lastSyncedAt: new Date().toISOString(), error: null });
      return { message: 'Transactions synced. Review your share before adding them to spending.' };
    } catch (e) { await ref.update({ error: safeBankError(e) }); throw e; }
  });
}
function validateShare(amount: number, original: number) {
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > Math.abs(original) || amount !== 0 && Math.sign(amount) !== Math.sign(original)) throw new ApiError('Your share must have the same sign as the bank amount and cannot exceed it. Ignore repayments received from friends.');
}
export async function reviewBankTransaction(uid: string, id: string, key: string, decision: 'import' | 'match' | 'ignore', matchId?: string, amountCents?: number, category?: string) {
  const ref = itemRef(uid, id), rowRef = ref.collection('transactions').doc(validKey(key));
  if (!['import', 'match', 'ignore'].includes(decision)) throw new ApiError('Invalid review action.');
  await admin().db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data() as Item | undefined;
    if (!item) throw new ApiError('Bank connection no longer exists.');
    if ((item.leaseUntil ?? 0) > Date.now()) throw new ApiError('Wait for bank sync to finish.', 409);
    const row = (await tx.get(rowRef)).data() as BankRow | undefined;
    if (!row || row.status !== 'review') throw new ApiError('This transaction was already reviewed.');
    if (decision === 'ignore') { tx.update(rowRef, { status: 'ignored' }); return; }
    const expenseId = decision === 'match' ? validDocumentId(matchId!) : 'plaid-' + key;
    const expenseRef = userRef(uid).collection('expenses').doc(expenseId);
    const current = (await tx.get(expenseRef)).data() as Expense | undefined;
    if (decision === 'match' && (!current || !possibleMatches([current], row.amountCents, row.date).length)) throw new ApiError('This expense cannot be matched. Refresh the review list.');
    if (decision === 'import' && current) throw new ApiError('This transaction is already imported.');
    if (decision === 'import') {
      validateShare(amountCents!, row.amountCents);
      if (!categories.includes(category!)) throw new ApiError('Choose a spending category.');
      if (amountCents === 0) { tx.update(rowRef, { status: 'ignored' }); return; }
    }
    const expense: Expense = current ? personalExpense(current, row.amountCents) : { id: expenseId, amountCents: amountCents!, date: row.date,
      category: category!, description: row.description, bankAmountCents: row.amountCents };
    tx.set(expenseRef, { ...expense, plaidTransactionId: row.transactionId, plaidItemId: ref.id });
    tx.update(rowRef, { status: 'imported', expenseId, matched: decision === 'match' });
  });
}
export async function ignoreImportedExpense(uid: string, expenseId: string) {
  const expenseRef = userRef(uid).collection('expenses').doc(validDocumentId(expenseId));
  const current = (await expenseRef.get()).data() as Expense | undefined;
  if (!current?.plaidItemId || !current.plaidTransactionId) throw new ApiError('This is not a bank expense.');
  const ref = itemRef(uid, current.plaidItemId), rowRef = ref.collection('transactions').doc(bankId(current.plaidTransactionId));
  await admin().db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data() as Item | undefined;
    const expense = (await tx.get(expenseRef)).data() as Expense | undefined;
    const reset = await resetBill(uid, tx, expense);
    if ((item?.leaseUntil ?? 0) > Date.now()) throw new ApiError('Wait for bank sync to finish.', 409);
    if (!expense || expense.plaidTransactionId !== current.plaidTransactionId) throw new ApiError('This expense changed. Refresh.');
    if (item) tx.set(rowRef, { status: 'ignored' }, { merge: true });
    reset(); tx.delete(expenseRef);
  });
}
export async function editImportedExpense(uid: string, expenseId: string, description: string, category: string, amountCents: number, date: string) {
  validDocumentId(expenseId); checkedDate(date);
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 200 || !categories.includes(category)) throw new ApiError('Choose a description and category.');
  if (date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new ApiError('Choose a valid expense date.');
  if (amountCents === 0) { await ignoreImportedExpense(uid, expenseId); return; }
  await admin().db.runTransaction(async tx => {
    const ref = userRef(uid).collection('expenses').doc(expenseId);
    const current = (await tx.get(ref)).data() as Expense | undefined;
    if (!current?.plaidTransactionId) throw new ApiError('This bank expense no longer exists.');
    const original = current.bankAmountCents ?? current.amountCents;
    validateShare(amountCents, original);
    tx.set(ref, { ...personalExpense(current, original), amountCents, description: description.trim(), category, date });
  });
}
export async function linkBankBillPayment(uid: string, billId: string, dueDate: string, expenseId: string) {
  validDocumentId(billId); validDocumentId(expenseId); checkedDate(dueDate);
  await admin().db.runTransaction(async tx => {
    const billRef = userRef(uid).collection('bills').doc(billId), expenseRef = userRef(uid).collection('expenses').doc(expenseId);
    const bill = (await tx.get(billRef)).data() as Bill | undefined, expense = (await tx.get(expenseRef)).data() as Expense | undefined;
    const all = await tx.get(userRef(uid).collection('expenses'));
    if (!bill || !expense || expense.billId || expense.id.startsWith('bill-') || expense.amountCents <= 0) throw new ApiError('Choose an expense that has not already been linked to a bill.');
    if (nextBillPayment(bill, all.docs.map(d => d.data() as Expense)) !== dueDate) throw new ApiError('The next unpaid date changed. Open the bill again.');
    tx.update(expenseRef, { billId, billDueDate: dueDate });
    if ((bill.frequency ?? 'once') === 'once') tx.update(billRef, { paid: true });
  });
}
export async function disconnectBank(uid: string, id: string) {
  const ref = itemRef(uid, id);
  await withBankLease(ref, async item => {
    try { await plaid().itemRemove({ access_token: decryptToken(item.token) }); }
    catch (e) { if (!['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'].includes(plaidErrorCode(e))) throw e; }
    await userRef(uid).collection('plaidInstitutions').doc(bankId(item.institutionId)).delete();
  });
  await admin().db.recursiveDelete(ref);
}
