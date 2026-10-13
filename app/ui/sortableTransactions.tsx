'use client';
import { useId } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bars3Icon } from '@heroicons/react/24/outline';
import type { Expense } from '@/app/lib/types';
import { TransactionContent, type TransactionActions } from './transactionList';

export default function SortableTransactions({ expenses, edit, remove, disabled, onReorder }: TransactionActions & { expenses: Expense[]; disabled: boolean; onReorder: (ids: string[]) => void }) {
  const id = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function finish(event: DragEndEvent) {
    if (disabled || !event.over || event.active.id === event.over.id) return;
    const from = expenses.findIndex(e => e.id === event.active.id), to = expenses.findIndex(e => e.id === event.over!.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(expenses.map(e => e.id), from, to));
  }
  if (!expenses.length) return <p className="empty">No expenses match these filters.</p>;
  return <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={finish} accessibility={{ screenReaderInstructions: { draggable: 'Press Space to pick up an expense. Use the up and down arrow keys to move it. Press Space to drop, or Escape to cancel.' } }}>
    <SortableContext items={expenses.map(e => e.id)} strategy={verticalListSortingStrategy}>
      <ul className="divide-y divide-gray-100">{expenses.map(expense => <SortableTransaction key={expense.id} expense={expense} edit={edit} remove={remove} disabled={disabled} />)}</ul>
    </SortableContext>
  </DndContext>;
}
function SortableTransaction({ expense, edit, remove, disabled }: TransactionActions & { expense: Expense; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: expense.id, disabled });
  return <li ref={setNodeRef} data-expense-id={expense.id} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }} className={'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white py-4 ' + (isDragging ? 'shadow-lg ring-2 ring-primary/20' : '')}>
    <TransactionContent expense={expense} edit={edit} remove={remove} dragHandle={<button ref={setActivatorNodeRef} {...attributes} {...listeners} className="expense-drag-handle icon-btn touch-none select-none text-gray-400 hover:text-primary" disabled={disabled} aria-label={'Reorder ' + expense.description} title="Drag to reorder. With a keyboard, press Space, then use arrow keys."><Bars3Icon className="h-5 w-5" aria-hidden="true" /></button>} />
  </li>;
}
