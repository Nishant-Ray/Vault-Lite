'use client';
import { useState } from 'react';
import { PlusIcon, CreditCardIcon, BuildingLibraryIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import { AccountForm } from '@/app/ui/forms';
import Card from '@/app/ui/card';
import { accountBalance, money, today, total } from '@/app/lib/finance';
import type { Account } from '@/app/lib/types';
import BankConnections from '@/app/ui/bankConnections';
export default function Wallet() {
  const { accounts, expenses, bills, remove } = useVault();
  const [edit, setEdit] = useState<Account | null | undefined>(); const [error, setError] = useState('');
  async function deleteAccount(account: Account) {
    if (!window.confirm(`Delete ${account.name}?`)) return;
    try { await remove('accounts', account.id); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete account.'); }
  }
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="page-title">Wallet</h1><p className="mt-2 text-sm text-off_gray">Know your cash. Keep your cards in check.</p></div><button className="btn" onClick={() => setEdit(null)}><PlusIcon className="h-5 w-5" />Add account</button></div>
    <BankConnections />
    {error && <p className="notice mb-6" role="alert">{error}</p>}
    {!accounts.length && <Card><p className="empty">Add your first bank account or credit card to start tracking.</p></Card>}
    {(['bank', 'credit'] as const).map(type => accounts.some(a => a.type === type) && <section key={type} className="mb-8"><h2 className="section-title mb-4">{type === 'bank' ? 'Bank accounts' : 'Credit cards'}</h2><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{accounts.filter(a => a.type === type).map(account => {
      const balance = accountBalance(account, expenses); const low = type === 'bank' && balance < account.minimumCents;
      const monthSpent = total(expenses.filter(e => e.accountId === account.id && e.date.startsWith(today().slice(0, 7))));
      const used = Boolean(account.plaidItemId) || expenses.some(e => e.accountId === account.id) || bills.some(b => b.accountId === account.id);
      return <Card key={account.id}><div className="mb-5 flex items-start justify-between gap-3"><div><p className="font-semibold">{account.name}</p><p className="mt-1 text-xs text-off_gray">{account.last4 ? `•••• ${account.last4}` : type === 'bank' ? 'Bank account' : 'Credit card'}</p></div>{type === 'bank' ? <BuildingLibraryIcon className="h-7 w-7 text-primary" /> : <CreditCardIcon className="h-7 w-7 text-primary" />}</div>
        <p className="text-xs text-off_gray">{account.plaidItemId ? type === 'bank' ? 'Bank-reported balance' : 'Bank-reported amount owed' : type === 'bank' ? 'Available balance' : 'Tracked amount owed'}</p><p className={`mb-4 mt-1 font-display text-3xl font-semibold tabular-nums ${low ? 'text-red-700' : ''}`}>{money(balance)}</p>
        {account.plaidBalanceUpdatedAt && <p className="mb-4 text-xs text-off_gray">Last checked {new Date(account.plaidBalanceUpdatedAt).toLocaleString()}. Bank updates may be delayed.</p>}
        {low && <p className="mb-4 rounded-lg bg-red-50 p-2 text-xs text-red-700">Below your {money(account.minimumCents)} safety buffer</p>}
        <div className="space-y-2 text-xs text-off_gray"><p>This month’s expenses: <span className="font-medium text-off_black">{money(monthSpent)}</span></p>{!account.plaidItemId && <p>Opening balance: {money(account.balanceCents)} · {account.balanceDate}</p>}</div>
        <div className="mt-5 flex flex-wrap gap-2"><button className="btn-neutral" onClick={() => setEdit(account)}>Edit</button><button className="icon-btn text-red-700" disabled={used} title={used ? 'Account has expense or bill history' : 'Delete account'} aria-label={`Delete ${account.name}`} onClick={() => void deleteAccount(account)}>×</button></div>
      </Card>;
    })}</div></section>)}
    {edit !== undefined && <AccountForm account={edit ?? undefined} close={() => setEdit(undefined)} />}
  </>;
}
