'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { ArrowPathIcon, LinkIcon } from '@heroicons/react/24/outline';
import { bankRequest } from '@/app/lib/bank-client';
import type { BankConnection, BankReview, BankStatus } from '@/app/lib/plaid-types';
import { accountLabel, money, today } from '@/app/lib/finance';
import { useVault } from './providers';
import { Modal } from './forms';
import Card from './card';

const sessionKey = 'vault-plaid-link';
export default function BankConnections() {
  const { user } = useVault();
  const [status, setStatus] = useState<BankStatus>({ connections: [], review: [] });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [configure, setConfigure] = useState<BankConnection | null>(null);
  const [token, setToken] = useState<string | null>(null), [updateId, setUpdateId] = useState<string>();
  const [redirectUri, setRedirectUri] = useState<string>(), [launch, setLaunch] = useState(false);
  const refresh = useCallback(async () => { setStatus(await bankRequest<BankStatus>()); }, []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    bankRequest<BankStatus>().then(data => { if (alive) setStatus(data); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    if (new URLSearchParams(window.location.search).has('oauth_state_id')) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');
        if (stored?.uid === user.uid && stored.token) {
          setToken(stored.token); setUpdateId(stored.itemId); setRedirectUri(window.location.href); setLaunch(true); setBusy(true);
        } else {
          setBusy(true);
          bankRequest<{ token: string; itemId: string | null }>({ action: 'resume' }).then(session => {
            if (!alive) return;
            setToken(session.token); setUpdateId(session.itemId ?? undefined); setRedirectUri(window.location.href); setLaunch(true);
          }).catch(e => { if (alive) { setError(e.message); setBusy(false); } });
        }
      } catch { setError('Could not restore bank authorization. Please try again.'); }
    }
    return () => { alive = false; };
  }, [user]);
  const clearLink = useCallback(() => {
    sessionStorage.removeItem(sessionKey); setToken(null); setRedirectUri(undefined); setUpdateId(undefined); setBusy(false);
    if (new URLSearchParams(window.location.search).has('oauth_state_id')) window.history.replaceState(window.history.state, '', '/wallet');
  }, []);
  const { open, ready, error: linkError } = usePlaidLink({ token, ...(redirectUri ? { receivedRedirectUri: redirectUri } : {}),
    onSuccess: async publicToken => {
      setError('');
      try {
        if (updateId) { await bankRequest({ action: 'sync', itemId: updateId }); setMessage('Bank reconnected and synced.'); }
        else { const item = await bankRequest<BankConnection>({ action: 'exchange', publicToken }); setConfigure(item); }
        await refresh();
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect bank.'); }
      finally { clearLink(); }
    },
    onExit: plaidError => { if (plaidError) setError('Bank authorization did not complete. Please try again.'); clearLink(); },
  });
  useEffect(() => { if (launch && ready) { setLaunch(false); open(); } }, [launch, ready, open]);
  useEffect(() => { if (linkError) { setError('Could not open bank authorization. Please try again.'); clearLink(); } }, [linkError, clearLink]);
  async function startLink(itemId?: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await bankRequest<{ token: string }>({ action: 'link', ...(itemId ? { itemId } : {}) });
      sessionStorage.setItem(sessionKey, JSON.stringify({ token: result.token, uid: user?.uid, itemId }));
      setUpdateId(itemId); setRedirectUri(undefined); setToken(result.token); setLaunch(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect bank.'); setBusy(false); }
  }
  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await bankRequest(body); await refresh(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete bank request.'); }
    finally { setBusy(false); }
  }
  return <div className="mb-8"><Card>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-title">Connected banks</h2><button className="btn-neutral gap-2" disabled={busy || loading} onClick={() => void startLink()}><LinkIcon className="h-5 w-5" />{busy ? 'Working...' : 'Connect bank'}</button></div>
    <p className="mt-3 text-sm leading-relaxed text-off_gray">Connect your existing accounts to import posted purchases and show bank-reported balances. Sync runs daily, and you can sync here anytime. Bank data may take time to update; pending purchases are not imported.</p>
    {error && <p className="notice mt-4" role="alert">{error}</p>}
    {message && <p className="mt-4 text-sm text-green-800" role="status">{message}</p>}
    {loading && <p role="status" className="mt-4 text-sm text-off_gray">Loading bank connections...</p>}
    <ul className="mt-4 divide-y divide-gray-100">{status.connections.map(item => <li key={item.id} className="py-4">
      <p className="font-semibold">{item.name}</p>
      <p className="mt-1 text-xs text-off_gray">{item.status === 'unconfigured' ? 'Choose accounts to finish connecting' : item.lastSyncedAt ? `Last synced ${new Date(item.lastSyncedAt).toLocaleString()}` : 'Ready for first sync'}</p>
      {item.error && <p className="mt-2 text-sm text-red-700">{item.error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {item.status === 'unconfigured' ? <button className="btn-neutral" disabled={busy} onClick={() => setConfigure(item)}>Choose accounts</button> : <button className="btn-neutral gap-2" disabled={busy} onClick={() => void act({ action: 'sync', itemId: item.id }, 'Synced the latest data available from your bank.')}><ArrowPathIcon className={`h-4 w-4 ${busy ? 'motion-safe:animate-spin' : ''}`} />Sync now</button>}
        <button className="btn-neutral" disabled={busy} onClick={() => void startLink(item.id)}>Reconnect</button>
        <button className="btn-neutral text-red-700" disabled={busy} onClick={() => { if (window.confirm(`Disconnect ${item.name}? Existing expenses stay saved. Wallet balances will return to manual tracking. Reconnecting later consumes another trial connection.`)) void act({ action: 'disconnect', itemId: item.id }, 'Bank disconnected. Your expense history is unchanged.'); }}>Disconnect</button>
      </div>
    </li>)}</ul>
    {!loading && !status.connections.length && !error && <p className="mt-4 text-sm text-off_gray">Your manual accounts remain available. Match them when you connect a bank.</p>}
  </Card>
    {!!status.review.length && <div className="mt-4"><Card><h2 className="section-title">Purchases to review ({status.review.length})</h2><p className="mt-2 text-sm text-off_gray">These may match expenses you already recorded. Match an existing expense, import as a separate purchase, or ignore it. Review shows up to 100 purchases per bank at a time.</p><ul className="mt-4 divide-y divide-gray-100">{status.review.map(row => <ReviewRow key={`${row.itemId}-${row.id}`} row={row} busy={busy} act={act} />)}</ul></Card></div>}
    {configure && <ConfigureBank item={configure} close={() => setConfigure(null)} done={async () => {
      setConfigure(null); await act({ action: 'sync', itemId: configure.id }, 'Bank connected. Posted purchases have been imported; check any matches awaiting review.');
    }} />}
  </div>;
}
function ConfigureBank({ item, close, done }: { item: BankConnection; close: () => void; done: () => Promise<void> }) {
  const { accounts } = useVault();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const mappings = Object.fromEntries(item.accounts.map(a => [a.id, String(form.get(a.id) ?? '')]));
    try { await bankRequest({ action: 'configure', itemId: item.id, mappings, importFrom: String(form.get('importFrom')) }); await done(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save bank accounts.'); setBusy(false); }
  }
  return <Modal title={`Connect ${item.name}`} close={busy ? () => undefined : close}><form className="space-y-4" onSubmit={submit}>
    <p className="text-sm text-off_gray">Match each account to the one you already track in Wallet to keep your history together. Choose a new account only if you have not added it before.</p>
    {item.accounts.map(bank => {
      const candidates = accounts.filter(a => !a.plaidItemId && a.type === bank.type);
      const matching = candidates.filter(a => bank.mask && a.last4 === bank.mask);
      return <label key={bank.id} className="field">{bank.name}{bank.mask ? ` · ${bank.mask}` : ''}<span className="text-xs font-normal text-off_gray">{bank.balanceCents === null ? 'Balance not supplied' : `${bank.type === 'credit' ? 'Amount owed' : 'Available balance'}: ${money(bank.balanceCents)}`}</span>
        <select name={bank.id} defaultValue={matching.length === 1 ? matching[0].id : ''}><option value="">Do not connect this account</option><option value="new">Create new Wallet account</option>{candidates.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</select>
      </label>;
    })}
    <label className="field">Import purchases from<input name="importFrom" type="date" required defaultValue={today()} /></label>
    <p className="text-sm text-off_gray">Earlier purchases stay out of spending. If you already recorded all purchases through today, choose tomorrow. Matching checks the same account and amount within three days; verify the review list. Bank-reported balances include all activity regardless of this date.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button className="btn-neutral" type="button" disabled={busy} onClick={close}>Later</button><button className="btn" disabled={busy}>{busy ? 'Connecting...' : 'Connect selected accounts'}</button></div>
  </form></Modal>;
}
function ReviewRow({ row, busy, act }: { row: BankReview; busy: boolean; act: (body: Record<string, unknown>, message: string) => Promise<void> }) {
  const { accounts } = useVault();
  const [matchId, setMatchId] = useState(row.matches[0]?.id ?? '');
  const review = (decision: string) => void act({ action: 'review', itemId: row.itemId, transactionId: row.id, decision, matchId }, 'Purchase reviewed.');
  return <li className="space-y-3 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{row.description}</p><p className="mt-1 text-xs text-off_gray">{row.date} · {accounts.find(a => a.id === row.accountId)?.name}</p></div><span className="shrink-0 font-semibold">{money(row.amountCents)}</span></div>
    {!!row.matches.length && <label className="field">Existing expense<select value={matchId} onChange={e => setMatchId(e.target.value)}>{row.matches.map(m => <option key={m.id} value={m.id}>{m.date} · {m.description}</option>)}</select></label>}
    <div className="flex flex-wrap gap-2">{!!row.matches.length && <button className="btn-neutral" disabled={busy || !matchId} onClick={() => review('match')}>Match expense</button>}<button className="btn-neutral" disabled={busy} onClick={() => review('import')}>Import separately</button><button className="btn-neutral" disabled={busy} onClick={() => review('ignore')}>Ignore</button></div>
  </li>;
}
