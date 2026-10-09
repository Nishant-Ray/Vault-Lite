import 'server-only';
import { randomUUID } from 'node:crypto';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { CountryCode, Products, CreditAccountSubtype, DepositoryAccountSubtype, type AccountBase, type Transaction } from 'plaid';
import { admin, ApiError } from './firebase-admin';
import { bankId, decryptToken, encryptToken, plaid, plaidErrorCode, safeBankError } from './plaid';
import { bankCategory, bankCents, isBankSpending, possibleMatches } from '../plaid-finance';
import type { Account, Expense } from '../types';
import type { BankConnection, BankReview, BankStatus, LinkedBankAccount } from '../plaid-types';
import { categories, type Bill } from '../types';
import { nextBillPayment } from '../bills';

type Item = {
  token: string; institutionId: string; name: string; status: 'connected' | 'unconfigured';
  accounts: LinkedBankAccount[]; mappings: Record<string, string>; importFrom: string; cursor: string;
  lastSyncedAt: string | null; error: string | null; environment: string;
  lease?: string; leaseUntil?: number;
};
type BankRow = {
  status: 'pending' | 'excluded' | 'before-start' | 'review' | 'imported' | 'ignored';
  transactionId: string; accountId: string; amountCents: number; date: string; description: string; category: string;
  expenseId?: string; matches?: string[]; matched?: boolean;
};
const userRef = (uid: string) => admin().db.collection('users').doc(uid);
const itemRef = (uid: string, id: string) => userRef(uid).collection('plaidItems').doc(validId(id));
function validId(id: string) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new ApiError('Invalid bank connection.');
  return id;
}
function checkedDate(value: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new ApiError('Choose a valid import start date.');
  return value;
}
function bankAccounts(accounts: AccountBase[]): LinkedBankAccount[] {
  return accounts.filter(a => (a.type === 'credit' && a.subtype === 'credit card')
    || (a.type === 'depository' && ['checking', 'savings', 'money market', 'cash management'].includes(a.subtype ?? '')))
    .filter(a => a.balances.iso_currency_code === 'USD').map(a => {
      const amount = a.type === 'credit' ? a.balances.current : a.balances.available ?? a.balances.current;
      return { id: a.account_id, name: (a.name || a.official_name || 'Bank account').slice(0, 200),
        mask: /^\d{4}$/.test(a.mask ?? '') ? a.mask! : '', type: a.type === 'credit' ? 'credit' : 'bank',
        balanceCents: amount === null ? null : bankCents(amount) };
    });
}
async function getItem(ref: DocumentReference) {
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError('This bank is no longer connected.', 404);
  const item = snapshot.data() as Item;
  if (item.environment !== (process.env.PLAID_ENV ?? 'sandbox')) throw new ApiError('This connection belongs to a different Plaid environment.');
  return item;
}
function publicItem(id: string, item: Item): BankConnection {
  return { id, name: item.name, status: item.status, accounts: item.accounts, mappings: item.mappings,
    importFrom: item.importFrom, lastSyncedAt: item.lastSyncedAt, error: item.error };
}
export async function bankStatus(uid: string): Promise<BankStatus> {
  const snapshots = await userRef(uid).collection('plaidItems').get();
  const expenses = (await userRef(uid).collection('expenses').get()).docs.map(d => d.data() as Expense);
  const review: BankReview[] = [];
  for (const item of snapshots.docs) {
    const rows = await item.ref.collection('transactions').where('status', '==', 'review').limit(100).get();
    for (const row of rows.docs) {
      const data = row.data() as BankRow;
      review.push({ itemId: item.id, id: row.id, accountId: data.accountId, description: data.description,
        amountCents: data.amountCents, date: data.date,
        matches: possibleMatches(expenses, data.accountId, data.amountCents, data.date).map(e => ({ id: e.id, description: e.description, date: e.date })) });
    }
  }
  return { connections: snapshots.docs.map(d => publicItem(d.id, d.data() as Item)), review };
}
export async function createBankLink(uid: string, id?: string) {
  // Verify encryption config before a real Item can consume a trial slot.
  encryptToken('configuration-check');
  const redirect = process.env.PLAID_REDIRECT_URI;
  if (!redirect) throw new ApiError('Set PLAID_REDIRECT_URI before connecting a bank.', 503);
  if (process.env.PLAID_ENV === 'production' && !redirect.startsWith('https://')) throw new ApiError('Plaid Production requires an HTTPS redirect URL. Use your deployed app or run localhost with HTTPS; HTTP localhost is only supported in Sandbox.', 503);
  const existing = id ? await getItem(itemRef(uid, id)) : null;
  const response = await plaid().linkTokenCreate({
    user: { client_user_id: uid }, client_name: 'Vault Lite', language: 'en', country_codes: [CountryCode.Us],
    redirect_uri: redirect,
    ...(existing ? { access_token: decryptToken(existing.token) } : { products: [Products.Transactions], transactions: { days_requested: 90 },
      account_filters: { credit: { account_subtypes: [CreditAccountSubtype.CreditCard] }, depository: { account_subtypes: [DepositoryAccountSubtype.Checking, DepositoryAccountSubtype.Savings, DepositoryAccountSubtype.MoneyMarket, DepositoryAccountSubtype.CashManagement] } } }),
  });
  // A PWA's bank redirect may return in Safari, which has separate storage.
  // The same authenticated owner can resume the latest Link session there.
  await userRef(uid).collection('plaidLinkSessions').doc('active').set({ token: response.data.link_token, itemId: id ?? null, expiresAt: response.data.expiration });
  return { token: response.data.link_token };
}
export async function resumeBankLink(uid: string) {
  const session = (await userRef(uid).collection('plaidLinkSessions').doc('active').get()).data();
  if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new ApiError('Bank authorization expired. Start connecting your bank again.');
  return { token: session.token as string, itemId: session.itemId as string | null };
}
export async function exchangeBank(uid: string, publicToken: string) {
  if (typeof publicToken !== 'string' || publicToken.length > 500 || !publicToken.startsWith('public-')) throw new ApiError('Invalid bank authorization.');
  const client = plaid();
  const exchange = (await client.itemPublicTokenExchange({ public_token: publicToken })).data;
  const ref = itemRef(uid, bankId(exchange.item_id));
  try {
    const token = encryptToken(exchange.access_token);
    const response = (await client.accountsGet({ access_token: exchange.access_token })).data;
    const institutionId = response.item.institution_id;
    if (!institutionId) throw new ApiError('This bank did not provide its institution identifier.');
    const accounts = bankAccounts(response.accounts);
    if (!accounts.length) throw new ApiError('No supported USD checking, savings, or credit-card accounts were shared.');
    const institution = (await client.institutionsGetById({ institution_id: institutionId, country_codes: [CountryCode.Us] })).data.institution;
    const marker = userRef(uid).collection('plaidInstitutions').doc(bankId(institutionId));
    const item: Item = { token, institutionId, name: institution.name.slice(0, 200), accounts, status: 'unconfigured',
      mappings: {}, importFrom: '', cursor: '', lastSyncedAt: null, error: null, environment: process.env.PLAID_ENV ?? 'sandbox' };
    await admin().db.runTransaction(async tx => {
      if ((await tx.get(marker)).exists) throw new ApiError('This bank is already connected. Use its Reconnect button instead of linking it again.');
      tx.create(ref, item); tx.create(marker, { itemId: ref.id });
    });
    return publicItem(ref.id, item);
  } catch (error) {
    // Revoke unusable or duplicate Items; trial slots are still consumed by Plaid.
    await client.itemRemove({ access_token: exchange.access_token }).catch(() => undefined);
    throw error;
  }
}
export async function configureBank(uid: string, id: string, mappings: Record<string, string>, importFrom: string) {
  checkedDate(importFrom);
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new ApiError('Choose the accounts to connect.');
  const ref = itemRef(uid, id);
  const pending = await getItem(ref);
  if (pending.status !== 'unconfigured') throw new ApiError('This bank has already been configured.');
  const currentBankAccounts = bankAccounts((await plaid().accountsGet({ access_token: decryptToken(pending.token) })).data.accounts);
  await admin().db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new ApiError('Bank connection no longer exists.');
    const item = snapshot.data() as Item;
    if (item.status !== 'unconfigured') throw new ApiError('This bank has already been configured.');
    const existing = await tx.get(userRef(uid).collection('accounts'));
    const selected: Record<string, string> = {};
    const writes: { ref: DocumentReference; data: Account }[] = [];
    for (const [plaidAccountId, vaultId] of Object.entries(mappings)) {
      const bank = currentBankAccounts.find(a => a.id === plaidAccountId);
      if (!bank || typeof vaultId !== 'string' || vaultId.includes('/') || vaultId.length > 200) throw new ApiError('Invalid account selection.');
      if (!vaultId) continue;
      const current = vaultId === 'new' ? undefined : existing.docs.find(d => d.id === vaultId)?.data() as Account | undefined;
      if (vaultId !== 'new' && !current) throw new ApiError('Choose an existing Wallet account or create a new one.');
      if (current && (current.plaidItemId || current.type !== bank.type)) throw new ApiError('Choose an unlinked Wallet account of the same type.');
      const accountId = current?.id ?? randomUUID();
      if (Object.values(selected).includes(accountId)) throw new ApiError('Each bank account needs a different Wallet account.');
      const data: Account = { ...(current ?? { id: accountId, name: bank.name, type: bank.type, last4: bank.mask,
        balanceCents: bank.balanceCents ?? 0, balanceDate: importFrom, minimumCents: bank.type === 'bank' ? 20000 : 0 }),
        plaidItemId: ref.id, plaidAccountId, ...(bank.balanceCents !== null ? { plaidBalanceCents: bank.balanceCents, plaidBalanceUpdatedAt: new Date().toISOString() } : {}) };
      if (bank.balanceCents === null) throw new ApiError('The bank has not supplied a balance for this account. Leave it unselected or retry later.');
      selected[plaidAccountId] = accountId;
      writes.push({ ref: userRef(uid).collection('accounts').doc(accountId), data });
    }
    if (!Object.keys(selected).length) throw new ApiError('Select at least one account.');
    writes.forEach(w => tx.set(w.ref, w.data));
    tx.update(ref, { accounts: currentBankAccounts, mappings: selected, importFrom, status: 'connected' });
  });
}
async function withBankLease<T>(ref: DocumentReference, work: (item: Item) => Promise<T>) {
  const lease = randomUUID();
  const item = await admin().db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new ApiError('Bank connection no longer exists.');
    const data = snapshot.data() as Item;
    if (data.environment !== (process.env.PLAID_ENV ?? 'sandbox')) throw new ApiError('This connection belongs to a different Plaid environment.');
    if ((data.leaseUntil ?? 0) > Date.now()) throw new ApiError('This bank is already syncing. Try again shortly.', 409);
    tx.update(ref, { lease, leaseUntil: Date.now() + 360000 });
    return data;
  });
  try { return await work(item); }
  finally {
    await admin().db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists && snapshot.data()?.lease === lease) tx.update(ref, { lease: FieldValue.delete(), leaseUntil: FieldValue.delete() });
    });
  }
}
async function applyTransaction(uid: string, ref: DocumentReference, item: Item, transaction: Transaction, modified: boolean) {
  const accountId = item.mappings[transaction.account_id];
  if (!accountId) return;
  const key = bankId(transaction.transaction_id), rowRef = ref.collection('transactions').doc(key);
  const amountCents = bankCents(transaction.amount);
  const data: BankRow = { transactionId: transaction.transaction_id, accountId, amountCents, date: transaction.date,
    description: (transaction.merchant_name || transaction.name || 'Bank transaction').slice(0, 200), category: bankCategory(transaction),
    status: transaction.pending ? 'pending' : transaction.date < item.importFrom ? 'before-start' : !isBankSpending(transaction) || amountCents === 0 ? 'excluded' : 'imported' };
  if (!modified && data.status !== 'imported') return;
  await admin().db.runTransaction(async tx => {
    const previous = (await tx.get(rowRef)).data() as BankRow | undefined;
    if (previous?.status === 'ignored') return;
    const expenseId = previous?.expenseId ?? `plaid-${key}`;
    const expenseRef = userRef(uid).collection('expenses').doc(expenseId);
    const current = (await tx.get(expenseRef)).data() as Expense | undefined;
    if (data.status !== 'imported') {
      // Removed/changed bank purchases no longer contribute to spending.
      if (current?.plaidTransactionId === transaction.transaction_id) {
        const billRef = current.billId ? userRef(uid).collection('bills').doc(current.billId) : null;
        const bill = billRef ? await tx.get(billRef) : null;
        if (billRef && bill?.exists && (bill.data()?.frequency ?? 'once') === 'once') tx.update(billRef, { paid: false });
        tx.delete(expenseRef);
      }
      if (previous) tx.set(rowRef, data); return;
    }
    // Query the account's expenses within the transaction so a concurrent manual
    // entry cannot silently become a duplicate while this import is committed.
    const snapshot = await tx.get(userRef(uid).collection('expenses').where('amountCents', '==', amountCents));
    const matches = possibleMatches(snapshot.docs.map(d => d.data() as Expense), accountId, amountCents, transaction.date);
    if (!current && matches.length) {
      tx.set(rowRef, { ...data, status: 'review', matches: matches.map(e => e.id) }); return;
    }
    const expense: Expense = { id: expenseId, accountId, amountCents, date: transaction.date,
      category: current?.category ?? data.category,
      description: current?.description ?? data.description,
      plaidTransactionId: transaction.transaction_id, plaidItemId: ref.id,
      ...(current?.billId ? { billId: current.billId, billDueDate: current.billDueDate } : {}) };
    tx.set(expenseRef, expense);
    tx.set(rowRef, { ...data, expenseId, matched: previous?.matched ?? false });
  });
}
export async function syncBank(uid: string, id: string) {
  const ref = itemRef(uid, id);
  return withBankLease(ref, async item => {
    if (item.status !== 'connected') throw new ApiError('Finish choosing your accounts first.');
    if (item.environment !== (process.env.PLAID_ENV ?? 'sandbox')) throw new ApiError('Wrong Plaid environment for this connection.');
    const client = plaid(), token = decryptToken(item.token);
    try {
      let cursor = item.cursor, transactions: { value: Transaction; modified: boolean }[] = [], removed: string[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        cursor = item.cursor; transactions = []; removed = [];
        try {
          for (let page = 0; ; page++) {
            if (page >= 100) throw new ApiError('Too many transactions in this update. Try a shorter import history.');
            const response = (await client.transactionsSync({ access_token: token, cursor: cursor || undefined, count: 500 })).data;
            transactions.push(...response.added.map(value => ({ value, modified: false })), ...response.modified.map(value => ({ value, modified: true })));
            removed.push(...response.removed.map(r => r.transaction_id));
            cursor = response.next_cursor;
            if (!response.has_more) break;
          }
          break;
        } catch (e) { if (plaidErrorCode(e) !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt === 2) throw e; }
      }
      // Process the full update before advancing the cursor. Retries use stable
      // transaction IDs, preserving decisions and avoiding duplicate expenses.
      // Fetch each bank transaction's latest version once. Small concurrent
      // groups keep a first import practical within a serverless time limit.
      const latest = new Map(transactions.map(t => [t.value.transaction_id, t]));
      const updates = [...latest.values()];
      for (let start = 0; start < updates.length; start += 4) {
        const results = await Promise.allSettled(updates.slice(start, start + 4).map(t => applyTransaction(uid, ref, item, t.value, t.modified)));
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }
      for (const transactionId of removed) {
        const rowRef = ref.collection('transactions').doc(bankId(transactionId));
        await admin().db.runTransaction(async tx => {
          const data = (await tx.get(rowRef)).data() as BankRow | undefined;
          if (data?.status === 'ignored') return;
          const expenseRef = data?.expenseId ? userRef(uid).collection('expenses').doc(data.expenseId) : null;
          const expense = expenseRef ? (await tx.get(expenseRef)).data() as Expense | undefined : undefined;
          const billRef = expense?.billId ? userRef(uid).collection('bills').doc(expense.billId) : null;
          const bill = billRef ? await tx.get(billRef) : null;
          if (expenseRef && expense?.plaidTransactionId === transactionId) {
            if (billRef && bill?.exists && (bill.data()?.frequency ?? 'once') === 'once') tx.update(billRef, { paid: false });
            tx.delete(expenseRef);
          }
          tx.delete(rowRef);
        });
      }
      // accounts/get supplies Plaid's latest cached balance without requiring an
      // extra real-time Balance call. Label it as reported, not live or guaranteed.
      const accounts = bankAccounts((await client.accountsGet({ access_token: token })).data.accounts);
      const now = new Date().toISOString();
      await admin().db.runTransaction(async tx => {
        const snapshots = await Promise.all(Object.values(item.mappings).map(accountId => tx.get(userRef(uid).collection('accounts').doc(accountId))));
        for (const snapshot of snapshots) {
          const current = snapshot.data() as Account | undefined;
          const bank = accounts.find(a => a.id === current?.plaidAccountId);
          if (current?.plaidItemId === ref.id && bank?.balanceCents !== null && bank?.balanceCents !== undefined) tx.update(snapshot.ref, { plaidBalanceCents: bank.balanceCents, plaidBalanceUpdatedAt: now });
        }
        tx.update(ref, { cursor, accounts, lastSyncedAt: now, error: null });
      });
      return { message: 'Synced the latest bank data. Check any purchases awaiting review.' };
    } catch (e) {
      await ref.update({ error: safeBankError(e) });
      throw e;
    }
  });
}
export async function reviewBankTransaction(uid: string, id: string, transactionKey: string, decision: 'import' | 'match' | 'ignore', matchId?: string) {
  const ref = itemRef(uid, id), rowRef = ref.collection('transactions').doc(validId(transactionKey));
  if (!['import', 'match', 'ignore'].includes(decision)) throw new ApiError('Invalid review action.');
  await admin().db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data() as Item | undefined;
    if (!item) throw new ApiError('Bank connection no longer exists.');
    if ((item.leaseUntil ?? 0) > Date.now()) throw new ApiError('Wait for this bank to finish syncing.', 409);
    const row = (await tx.get(rowRef)).data() as BankRow | undefined;
    if (!row || row.status !== 'review') throw new ApiError('This purchase has already been reviewed.');
    if (decision === 'ignore') { tx.update(rowRef, { status: 'ignored' }); return; }
    const expenseId = decision === 'match' ? matchId : `plaid-${transactionKey}`;
    if (!expenseId || expenseId.includes('/') || expenseId.length > 200) throw new ApiError('Choose the matching expense.');
    const expenseRef = userRef(uid).collection('expenses').doc(expenseId);
    const current = (await tx.get(expenseRef)).data() as Expense | undefined;
    if (decision === 'match' && (!current || !possibleMatches([current], row.accountId, row.amountCents, row.date).length)) throw new ApiError('That expense can no longer be matched. Refresh the review list.');
    if (decision === 'import' && current) throw new ApiError('This purchase is already imported.');
    tx.set(expenseRef, { ...(current ?? {}), id: expenseId, accountId: row.accountId, amountCents: row.amountCents,
      date: row.date, category: current?.category ?? row.category, description: current?.description ?? row.description,
      plaidTransactionId: row.transactionId, plaidItemId: ref.id });
    tx.update(rowRef, { status: 'imported', expenseId, matched: decision === 'match' });
  });
}
export async function ignoreImportedExpense(uid: string, expenseId: string) {
  if (typeof expenseId !== 'string' || expenseId.includes('/') || expenseId.length > 200) throw new ApiError('Invalid expense.');
  const expenseRef = userRef(uid).collection('expenses').doc(expenseId);
  const current = (await expenseRef.get()).data() as Expense | undefined;
  if (!current?.plaidItemId || !current.plaidTransactionId) throw new ApiError('This is not a bank expense.');
  const ref = itemRef(uid, current.plaidItemId), rowRef = ref.collection('transactions').doc(bankId(current.plaidTransactionId));
  await admin().db.runTransaction(async tx => {
    const item = (await tx.get(ref)).data() as Item | undefined;
    const expense = (await tx.get(expenseRef)).data() as Expense | undefined;
    const billRef = expense?.billId ? userRef(uid).collection('bills').doc(expense.billId) : null;
    const bill = billRef ? await tx.get(billRef) : null;
    if ((item?.leaseUntil ?? 0) > Date.now()) throw new ApiError('Wait for this bank to finish syncing.', 409);
    if (!expense || expense.plaidTransactionId !== current.plaidTransactionId) throw new ApiError('This expense changed. Try again.');
    if (item) tx.set(rowRef, { status: 'ignored' }, { merge: true });
    if (billRef && bill?.exists && (bill.data()?.frequency ?? 'once') === 'once') tx.update(billRef, { paid: false });
    tx.delete(expenseRef);
  });
}
export async function editImportedExpense(uid: string, expenseId: string, description: string, category: string) {
  if (typeof expenseId !== 'string' || expenseId.includes('/') || expenseId.length > 200) throw new ApiError('Invalid expense.');
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 200 || !categories.includes(category)) throw new ApiError('Choose a description and category.');
  await admin().db.runTransaction(async tx => {
    const ref = userRef(uid).collection('expenses').doc(expenseId);
    const current = (await tx.get(ref)).data() as Expense | undefined;
    if (!current?.plaidTransactionId) throw new ApiError('This bank expense no longer exists.');
    tx.update(ref, { description: description.trim(), category });
  });
}
export async function linkBankBillPayment(uid: string, billId: string, dueDate: string, expenseId: string) {
  if ([billId, expenseId].some(id => typeof id !== 'string' || id.includes('/') || !id || id.length > 200)) throw new ApiError('Invalid bill payment.');
  checkedDate(dueDate);
  await admin().db.runTransaction(async tx => {
    const billRef = userRef(uid).collection('bills').doc(billId), expenseRef = userRef(uid).collection('expenses').doc(expenseId);
    const bill = (await tx.get(billRef)).data() as Bill | undefined;
    const expense = (await tx.get(expenseRef)).data() as Expense | undefined;
    const all = await tx.get(userRef(uid).collection('expenses'));
    if (!bill || !expense?.plaidTransactionId || expense.billId || expense.amountCents <= 0 || expense.accountId !== bill.accountId) throw new ApiError('Choose an imported purchase on this bill\'s account that has not already been linked to a bill.');
    if (nextBillPayment(bill, all.docs.map(d => d.data() as Expense)) !== dueDate) throw new ApiError('The next unpaid bill date changed. Open this bill again.');
    tx.update(expenseRef, { billId, billDueDate: dueDate });
    if ((bill.frequency ?? 'once') === 'once') tx.update(billRef, { paid: true });
  });
}
export async function disconnectBank(uid: string, id: string) {
  const ref = itemRef(uid, id);
  await withBankLease(ref, async item => {
    const token = decryptToken(item.token);
    try { await plaid().itemRemove({ access_token: token }); }
    catch (e) { if (!['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'].includes(plaidErrorCode(e))) throw e; }
    // Keep the Item until cleanup finishes so a failed cleanup can be retried.
    await admin().db.runTransaction(async tx => {
      const accounts = await tx.get(userRef(uid).collection('accounts').where('plaidItemId', '==', ref.id));
      const expenses = await tx.get(userRef(uid).collection('expenses'));
      const date = new Date().toISOString().slice(0, 10);
      for (const snapshot of accounts.docs) {
        const a = snapshot.data() as Account;
        const spent = expenses.docs.reduce((sum, d) => { const e = d.data() as Expense; return sum + (e.accountId === a.id && e.date === date ? e.amountCents : 0); }, 0);
        // Rebase manual tracking to the last bank snapshot without applying
        // today's already imported purchases twice.
        tx.update(snapshot.ref, { ...(a.plaidBalanceCents !== undefined ? { balanceCents: a.plaidBalanceCents + (a.type === 'bank' ? spent : -spent), balanceDate: date } : {}),
          plaidItemId: FieldValue.delete(), plaidAccountId: FieldValue.delete(), plaidBalanceCents: FieldValue.delete(), plaidBalanceUpdatedAt: FieldValue.delete() });
      }
      tx.delete(userRef(uid).collection('plaidInstitutions').doc(bankId(item.institutionId)));
    });
  });
  // Private transaction decisions are no longer needed after revocation;
  // expense history remains in the normal user collection.
  await admin().db.recursiveDelete(ref);
}
