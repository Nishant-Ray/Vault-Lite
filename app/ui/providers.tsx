'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, runTransaction, setDoc, writeBatch } from 'firebase/firestore';
import { bankRequest } from '@/app/lib/bank-client';
import { allowedUid, firebase, firebaseConfigured } from '@/app/lib/firebase';
import type { Bill, BillPayment, Expense } from '@/app/lib/types';
import { nextBillPayment } from '@/app/lib/bills';

type CollectionName = 'expenses' | 'bills';
type VaultContext = {
  user: User | null; loading: boolean; dataLoading: boolean; error: string; configured: boolean;
  expenses: Expense[]; bills: Bill[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  save: (name: CollectionName, data: Bill | Expense) => Promise<void>;
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  useEffect(() => {
    if (!firebaseConfigured) return;
    try {
      return onAuthStateChanged(firebase().auth, next => {
        if (next && next.uid !== allowedUid) {
          setError('This account does not have access to Vault Lite.');
          void signOut(firebase().auth); setUser(null);
        } else { setUser(next); setDataLoading(Boolean(next)); }
        setLoading(false);
      }, () => { setError('Unable to restore your session. Please log in again.'); setLoading(false); });
    } catch { setLoading(false); setError('Unable to initialize Firebase. Check your configuration.'); }
  }, []);
  useEffect(() => {
    setExpenses([]); setBills([]);
    if (!user) { setDataLoading(false); return; }
    setError('');
    const ready = new Set<string>();
    const listen = <T,>(name: CollectionName, setter: (data: T[]) => void) => onSnapshot(
      collection(firebase().db, 'users', user.uid, name),
      snapshot => {
        setter(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as T));
        ready.add(name);
        if (ready.size === 2) setDataLoading(false);
      },
      () => { setError('Could not load your data. Check your connection and deployed Firestore rules.'); setDataLoading(false); },
    );
    const unsubscribes = [listen<Expense>('expenses', setExpenses), listen<Bill>('bills', setBills)];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [user]);
  const reference = (name: CollectionName, id: string) => {
    if (!user || user.uid !== allowedUid) throw new Error('Log in to continue.');
    return doc(firebase().db, 'users', user.uid, name, id);
  };
  const save = async (name: CollectionName, data: Expense | Bill) => {
    if (name === 'expenses') {
      const e = data as Expense;
      if (e.plaidTransactionId) {
        await bankRequest({ action: 'edit-expense', expenseId: e.id, description: e.description,
          category: e.category, amountCents: e.amountCents, date: e.date }); return;
      }
      // Explicit fields remove legacy account references when an entry is edited.
      await setDoc(reference(name, e.id), { id: e.id, amountCents: e.amountCents, date: e.date,
        category: e.category, description: e.description,
        ...(e.billId ? { billId: e.billId, billDueDate: e.billDueDate } : {}) });
    } else {
      const b = data as Bill;
      await setDoc(reference(name, b.id), { id: b.id, amountCents: b.amountCents, dueDate: b.dueDate,
        category: b.category, name: b.name, paid: b.paid, frequency: b.frequency ?? 'once' });
    }
  };
  const remove = async (name: CollectionName, id: string) => {
    const expense = name === 'expenses' ? expenses.find(e => e.id === id) : undefined;
    if (expense?.plaidTransactionId) { await bankRequest({ action: 'ignore-expense', expenseId: id }); return; }
    const batch = writeBatch(firebase().db);
    batch.delete(reference(name, id));
    if (expense?.billId || (name === 'expenses' && id.startsWith('bill-'))) {
      const billId = expense?.billId ?? id.slice(5);
      const bill = bills.find(b => b.id === billId);
      if (bill && (bill.frequency ?? 'once') === 'once') batch.update(reference('bills', billId), { paid: false });
    }
    await batch.commit();
  };
  const payBill = async (bill: Bill, payment: BillPayment) => {
    if (payment.expenseId) {
      await bankRequest({ action: 'link-bill', billId: bill.id, dueDate: payment.dueDate, expenseId: payment.expenseId }); return;
    }
    await runTransaction(firebase().db, async tx => {
      const billRef = reference('bills', bill.id), snapshot = await tx.get(billRef);
      if (!snapshot.exists()) throw new Error('Bill no longer exists.');
      const current = snapshot.data() as Bill;
      if (current.dueDate !== bill.dueDate || (current.frequency ?? 'once') !== (bill.frequency ?? 'once') || current.amountCents !== bill.amountCents) throw new Error('This bill changed. Open the payment dialog again.');
      const history = await tx.get(reference('expenses', 'bill-' + bill.id + '-' + payment.dueDate));
      if (history.exists()) return;
      if (nextBillPayment(current, expenses) !== payment.dueDate) throw new Error('This payment date is no longer the next unpaid occurrence.');
      const expense: Expense = { id: history.id, billId: bill.id, billDueDate: payment.dueDate,
        amountCents: payment.amountCents, date: payment.date, category: current.category, description: current.name };
      tx.set(history.ref, expense);
      if ((current.frequency ?? 'once') === 'once') tx.update(billRef, { paid: true });
    });
  };
  return <Context.Provider value={{ user, loading, dataLoading, configured: firebaseConfigured, error, expenses, bills,
    login: async (email, password) => {
      setError('');
      const result = await signInWithEmailAndPassword(firebase().auth, email, password);
      if (result.user.uid !== allowedUid) { await signOut(firebase().auth); throw new Error('This account does not have access.'); }
    },
    logout: async () => { await signOut(firebase().auth); }, save, remove, payBill,
  }}>{children}</Context.Provider>;
}
