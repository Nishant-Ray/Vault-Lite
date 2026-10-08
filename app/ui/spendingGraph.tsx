'use client';
// Adapted from Vault's spendingGraph.tsx: same Chart.js bar chart, now driven
// by Firestore expenses rather than Rails monthly aggregate endpoints.
import { Chart, LinearScale, CategoryScale, BarElement, Tooltip, type ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { colors } from '@/app/lib/colors';
import { filterExpenses, money, total } from '@/app/lib/finance';
import type { Expense } from '@/app/lib/types';
import { outfit } from './fonts';
Chart.register(LinearScale, CategoryScale, BarElement, Tooltip);
Chart.defaults.font.family = outfit.style.fontFamily;
export default function SpendingGraph({ expenses, year, accountId }: { expenses: Expense[]; year: string; accountId: string }) {
  const labels = Array.from({ length: 12 }, (_, i) => new Date(2020, i).toLocaleDateString('en-US', { month: 'short' }));
  const options: ChartOptions<'bar'> = { responsive: true, maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { maxTicksLimit: 6, callback: value => money(Number(value)) } }, x: { grid: { display: false } } },
    plugins: { tooltip: { callbacks: { label: context => `Spent: ${money(Number(context.raw))}` } } },
  };
  const data = { labels, datasets: [{ label: 'Total spent', data: labels.map((_, i) => total(filterExpenses(expenses, `${year}-${String(i + 1).padStart(2, '0')}`, accountId))), backgroundColor: colors.accent, borderRadius: 5 }] };
  return <div className="mt-5 h-60 min-w-0" role="img" aria-label={`Monthly spending chart for ${year}`}><Bar options={options} data={data} /></div>;
}
