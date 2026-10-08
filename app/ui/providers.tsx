'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import { allowedUid, firebase, firebaseConfigured } from '@/app/lib/firebase';
import type { Account, Bill, BillPayment, Expense } from '@/app/lib/types';

type CollectionName = 'accounts' | 'expenses' | 'bills';
type VaultContext = {
  user: User | null; loading: boolean; dataLoading: boolean; error: string; configured: boolean;
  accounts: Account[]; expenses: Expense[]; bills: Bill[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  save: (name: CollectionName, data: Account | Bill | Expense) => Promise<void>;
  remove: (name: CollectionName, id: string) => Promise<void>;
  payBill: (bill: Bill, payment: BillPayment) => Promise<void>;
};
const Context = createContext<VaultContext | null>(null);
export const useVault = () => {
  const context = useContext(Context);
  if (!context) throw new Error('Vault provider is missing.');
  return context;
};
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  useEffect(() => {
    if (!firebaseConfigured) return;
    try {
      return onAuthStateChanged(firebase().auth, next => {
        if (next && next.uid !== allowedUid) {
          setError('This account does not have access to Vault Lite.');
          void signOut(firebase().auth);
          setUser(null);
        } else {
          setUser(next);
          setDataLoading(Boolean(next));
        }
        setLoading(false);
      }, () => { setError('Unable to restore your session. Please log in again.'); setLoading(false); });
    } catch { setLoading(false); setError('Unable to initialize Firebase. Check your configuration.'); }
  }, []);
  useEffect(() => {
    setAccounts([]); setExpenses([]); setBills([]);
    if (!user) { setDataLoading(false); return; }
    setError('');
    const ready = new Set<string>();
    const listen = <T,>(name: CollectionName, setter: (data: T[]) => void) => onSnapshot(
      collection(firebase().db, 'users', user.uid, name),
      snapshot => {
        setter(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as T));
        ready.add(name);
        if (ready.size === 3) setDataLoading(false);
      },
      () => { setError('Could not load your data. Check your connection and deployed Firestore rules.'); setDataLoading(false); },
    );
    const unsubscribes = [listen<Account>('accounts', setAccounts), listen<Expense>('expenses', setExpenses), listen<Bill>('bills', setBills)];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [user]);
  const reference = (name: CollectionName, id: string) => {
    if (!user || user.uid !== allowedUid) throw new Error('Log in to continue.');
    return doc(firebase().db, 'users', user.uid, name, id);
  };
  const save = async (name: CollectionName, data: Account | Bill | Expense) => {
    if (name === 'accounts') { await setDoc(reference(name, data.id), data); return; }
    const item = data as Expense | Bill;
    // Read the account in the same transaction so concurrent deletion cannot
    // create an expense or bill referencing an account that no longer exists.
    await runTransaction(firebase().db, async tx => {
      const account = await tx.get(reference('accounts', item.accountId));
      if (!account.exists()) throw new Error('Select an existing account.');
      tx.set(reference(name, item.id), item);
    });
  };
  const remove = async (name: CollectionName, id: string) => {
    if (name === 'accounts') {
      if (expenses.some(e => e.accountId === id) || bills.some(b => b.accountId === id)) throw new Error('This account has expenses or bills. Keep it for historical reporting.');
    }
    const batch = writeBatch(firebase().db);
    batch.delete(reference(name, id));
    // Removing a payment restores that occurrence. Recurring schedules derive
    // unpaid dates from expense history; one-time bills also reset their flag.
    if (name === 'expenses' && id.startsWith('bill-')) {
      const expense = expenses.find(e => e.id === id);
      const billId = expense?.billId ?? id.slice(5);
      const bill = bills.find(b => b.id === billId);
      if (bill && (bill.frequency ?? 'once') === 'once') batch.update(reference('bills', billId), { paid: false });
    }
    await batch.commit();
  };
  const payBill = async (bill: Bill, payment: BillPayment) => {
    await runTransaction(firebase().db, async tx => {
      const billRef = reference('bills', bill.id);
      const snapshot = await tx.get(billRef);
      if (!snapshot.exists()) throw new Error('Bill no longer exists.');
      const current = snapshot.data() as Bill;
      if (current.dueDate !== bill.dueDate || (current.frequency ?? 'once') !== (bill.frequency ?? 'once') || current.amountCents !== bill.amountCents || current.accountId !== bill.accountId) throw new Error('This bill changed. Close this dialog and record the payment again.');
      const recurring = (current.frequency ?? 'once') !== 'once';
      if (!recurring && current.paid) return;
      // Each scheduled occurrence has one stable expense ID, so repeated clicks
      // and concurrent payments cannot create duplicate spending.
      const expenseId = `bill-${bill.id}-${payment.dueDate}`;
      const expenseRef = reference('expenses', expenseId);
      const existing = await tx.get(expenseRef);
      if (existing.exists()) return;
      const account = await tx.get(reference('accounts', payment.accountId));
      if (!account.exists()) throw new Error('Choose an existing account for this bill.');
      const expense: Expense = { id: expenseId, billId: bill.id, billDueDate: payment.dueDate, accountId: payment.accountId, amountCents: payment.amountCents, date: payment.date, category: current.category, description: current.name };
      tx.set(expenseRef, expense);
      if (!recurring) tx.update(billRef, { paid: true });
    });
  };
  return <Context.Provider value={{ user, loading, dataLoading, configured: firebaseConfigured, error, accounts, expenses, bills,
    login: async (email, password) => {
      setError('');
      const result = await signInWithEmailAndPassword(firebase().auth, email, password);
      if (result.user.uid !== allowedUid) { await signOut(firebase().auth); throw new Error('This account does not have access.'); }
    },
    logout: async () => { await signOut(firebase().auth); }, save, remove, payBill,
  }}>{children}</Context.Provider>;
}
