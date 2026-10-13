import type { Expense } from './types';
export type SpendingSort = 'alphabetical' | 'newest' | 'oldest' | 'custom';
export const spendingSorts: { value: SpendingSort; label: string }[] = [
  { value: 'alphabetical', label: 'Alphabetical' }, { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' }, { value: 'custom', label: 'My custom order' },
];
export function sortSpending(expenses: Expense[], mode: SpendingSort, ids: string[] = []) {
  const rank = new Map(ids.map((id, index) => [id, index]));
  const alphabetical = (a: Expense, b: Expense) => a.description.localeCompare(b.description, 'en', { sensitivity: 'base', numeric: true }) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  return [...expenses].sort((a, b) => {
    if (mode === 'custom') return (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || alphabetical(a, b);
    if (mode === 'newest') return b.date.localeCompare(a.date) || alphabetical(a, b);
    if (mode === 'oldest') return a.date.localeCompare(b.date) || alphabetical(a, b);
    return alphabetical(a, b);
  });
}
// Replace only visible positions; hidden months/categories keep their positions.
export function mergeVisibleOrder(allIds: string[], visibleIds: string[]) {
  const visible = new Set(visibleIds), replacements = [...new Set(visibleIds)];
  let index = 0;
  return [...new Set(allIds)].map(id => visible.has(id) ? replacements[index++] : id);
}
