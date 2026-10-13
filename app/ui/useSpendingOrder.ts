'use client';
import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { firebase } from '@/app/lib/firebase';
import { mergeVisibleOrder, sortSpending, spendingSorts, type SpendingSort } from '@/app/lib/spending-order';
import type { Expense } from '@/app/lib/types';
import { useVault } from './providers';

type Order = { mode: SpendingSort; ids: string[] };
const defaultOrder: Order = { mode: 'oldest', ids: [] };
function readOrder(value: Record<string, unknown> | undefined): Order {
  return { mode: spendingSorts.some(s => s.value === value?.mode) ? value!.mode as SpendingSort : defaultOrder.mode,
    ids: Array.isArray(value?.ids) ? value.ids.filter((id): id is string => typeof id === 'string') : [] };
}
export function useSpendingOrder(year: string, expenses: Expense[]) {
  const { user } = useVault();
  const [state, setState] = useState({ year, order: defaultOrder, ready: false });
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  const scope = useRef(year); scope.current = year;
  const order = state.year === year ? state.order : defaultOrder;
  const ready = state.year === year && state.ready;
  useEffect(() => {
    if (!user) return;
    setError(''); setState({ year, order: defaultOrder, ready: false });
    return onSnapshot(doc(firebase().db, 'users', user.uid, 'spendingOrders', year), snapshot => {
      if (!pending.current) setState({ year, order: readOrder(snapshot.data()), ready: true });
    }, () => { setState({ year, order: defaultOrder, ready: true }); setError('Could not load your saved order. Check your connection and updated Firestore rules.'); });
  }, [user, year]);
  async function save(mode: SpendingSort, visibleIds?: string[]) {
    if (!user || pending.current || !ready) return;
    pending.current = true; setSaving(true); setError('');
    const previous = order;
    const optimistic: Order = { mode, ids: visibleIds ? mergeVisibleOrder(sortSpending(expenses, order.mode, order.ids).map(e => e.id), visibleIds) : order.ids };
    setState({ year, order: optimistic, ready: true });
    try {
      const ref = doc(firebase().db, 'users', user.uid, 'spendingOrders', year);
      const saved = await runTransaction(firebase().db, async tx => {
        const latest = readOrder((await tx.get(ref)).data());
        const next = { mode, ids: visibleIds ? mergeVisibleOrder(sortSpending(expenses, latest.mode, latest.ids).map(e => e.id), visibleIds) : latest.ids };
        tx.set(ref, next); return next;
      });
      if (scope.current === year) setState({ year, order: saved, ready: true });
    } catch {
      if (scope.current === year) { setState({ year, order: previous, ready: true }); setError('Could not save your order. Check your connection and publish the updated Firestore rules, then try again.'); }
    } finally { pending.current = false; setSaving(false); }
  }
  return { order, ready, saving, error, setMode: (mode: SpendingSort) => save(mode), reorder: (ids: string[]) => save('custom', ids) };
}
