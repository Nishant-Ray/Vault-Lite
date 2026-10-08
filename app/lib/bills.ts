import type { Bill, BillFrequency, Expense } from './types';

export const billFrequencies: { value: BillFrequency; label: string }[] = [
  { value: 'once', label: 'One time' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
];

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Choose a valid payment date.');
  return date;
}
const dateString = (date: Date) => date.toISOString().slice(0, 10);

// Calculate each occurrence from the original date to preserve month-end and
// leap-year anchors rather than drifting after February or a shorter month.
export function billOccurrence(bill: Bill, index: number) {
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid payment occurrence.');
  const date = parseDate(bill.dueDate);
  const frequency = bill.frequency ?? 'once';
  if (frequency === 'once') return index === 0 ? bill.dueDate : null;
  if (frequency === 'weekly' || frequency === 'biweekly') {
    date.setUTCDate(date.getUTCDate() + index * (frequency === 'weekly' ? 7 : 14));
  } else {
    const anchorDay = date.getUTCDate();
    const months = index * (frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(anchorDay, lastDay));
  }
  return dateString(date);
}

export function isBillPayment(expense: Expense, bill: Bill) {
  return expense.billId === bill.id || expense.id === `bill-${bill.id}`;
}

export function nextBillPayment(bill: Bill, expenses: Expense[]) {
  const frequency = bill.frequency ?? 'once';
  const paidDates = new Set(expenses.filter(e => isBillPayment(e, bill)).map(e => e.billDueDate ?? bill.dueDate));
  if (frequency === 'once' && (bill.paid || paidDates.has(bill.dueDate))) return null;
  // At most one occurrence can be paid per expense, so the first unpaid one
  // must be found within this many iterations, even for a long-lived schedule.
  for (let index = 0; index <= paidDates.size; index++) {
    const date = billOccurrence(bill, index);
    if (date === null || !paidDates.has(date)) return date;
  }
  return null;
}

export function billScheduleLabel(bill: Bill) {
  const frequency = bill.frequency ?? 'once';
  const date = parseDate(bill.dueDate);
  if (frequency === 'once') return 'One time';
  if (frequency === 'weekly' || frequency === 'biweekly') return `${frequency === 'weekly' ? 'Weekly' : 'Every 2 weeks'} on ${date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`;
  if (frequency === 'yearly') return `Yearly on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return `${frequency === 'monthly' ? 'Monthly' : 'Every 3 months'} on day ${date.getUTCDate()}`;
}

export function monthlyBillEstimate(bill: Bill) {
  const frequency = bill.frequency ?? 'once';
  const factor = { once: 0, weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[frequency];
  return Math.round(bill.amountCents * factor);
}
