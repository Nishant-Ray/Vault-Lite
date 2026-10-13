'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { ArrowPathIcon, BuildingLibraryIcon, LinkIcon } from '@heroicons/react/24/outline';
import { bankRequest } from '@/app/lib/bank-client';
import type { BankConnection, BankStatus } from '@/app/lib/plaid-types';
import { today } from '@/app/lib/finance';
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
        if (updateId) {
          const current = await bankRequest<BankStatus>();
          const item = current.connections.find(c => c.id === updateId);
          if (item?.status === 'unconfigured') setConfigure(item);
          else { await bankRequest({ action: 'sync', itemId: updateId }); setMessage('Bank reconnected and synced.'); }
        }
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
  return <div className="mb-8"><Card className="rounded-2xl border border-gray-200/80">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-primary"><BuildingLibraryIcon className="h-6 w-6" aria-hidden="true" /></div><div><h2 className="section-title">Connected banks</h2>{!loading && !!status.connections.length && <p className="mt-1 text-xs text-off_gray">{status.connections.length} {status.connections.length === 1 ? 'bank' : 'banks'} linked</p>}</div></div>
      <button className="btn w-full sm:w-auto" disabled={busy || loading} onClick={() => void startLink()}>{busy ? <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" aria-hidden="true" /> : <LinkIcon className="h-4 w-4" aria-hidden="true" />}{busy ? 'Working...' : 'Connect bank'}</button>
    </div>
    {error && <p className="notice mt-4" role="alert">{error}</p>}
    {message && <p className="mt-4 text-sm text-green-800" role="status">{message}</p>}
    {loading && <div role="status" aria-label="Loading connected banks" className="mt-5 space-y-3"><span className="sr-only">Loading connected banks</span>{[0, 1].map(row => <div key={row} aria-hidden="true" className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4"><div className="flex items-center gap-3"><div className="bank-skeleton h-10 w-10 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><div className="bank-skeleton h-3.5 w-32 max-w-full rounded-full" /><div className="bank-skeleton h-2.5 w-48 max-w-full rounded-full" /></div></div><div className="mt-4 flex gap-2"><div className="bank-skeleton h-8 w-24 rounded-full" /><div className="bank-skeleton h-8 w-24 rounded-full" /></div></div>)}</div>}
    {!loading && !!status.connections.length && <ul className="mt-5 space-y-3">{status.connections.map(item => <li key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{item.name}</p><p className="mt-1.5 text-xs text-off_gray">{item.status === 'unconfigured' ? 'Choose sources to finish connecting' : item.lastSyncedAt ? `Last synced ${new Date(item.lastSyncedAt).toLocaleString()}` : 'Ready for first sync'}</p></div><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${item.error || item.status === 'unconfigured' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}><span className={`h-1.5 w-1.5 rounded-full ${item.error || item.status === 'unconfigured' ? 'bg-amber-500' : 'bg-green-500'}`} aria-hidden="true" />{item.error ? 'Needs attention' : item.status === 'unconfigured' ? 'Finish setup' : 'Connected'}</span></div>
      {item.error && <p className="mt-2 text-sm text-red-700">{item.error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.status === 'unconfigured' ? <button className="btn-neutral" disabled={busy} onClick={() => setConfigure(item)}>Choose sources</button> : <button className="btn-neutral gap-2" disabled={busy} onClick={() => void act({ action: 'sync', itemId: item.id }, 'Synced the latest data available from your bank.')}><ArrowPathIcon className={`h-4 w-4 ${busy ? 'motion-safe:animate-spin' : ''}`} />Sync now</button>}
        <button className="btn-neutral" disabled={busy} onClick={() => void startLink(item.id)}>Reconnect</button>
        <button className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium text-off_gray transition hover:bg-red-50 hover:text-red-700" disabled={busy} onClick={() => { if (window.confirm(`Disconnect ${item.name}? Existing personal expenses stay saved. Reconnecting later consumes another trial connection.`)) void act({ action: 'disconnect', itemId: item.id }, 'Bank disconnected. Your expense history is unchanged.'); }}>Disconnect</button>
      </div>
    </li>)}</ul>}
    {!loading && !status.connections.length && !error && <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-7"><LinkIcon className="h-7 w-7 text-gray-400" aria-hidden="true" /><p className="text-sm text-off_gray">No banks connected yet</p></div>}
  </Card>
    {configure && <ConfigureBank item={configure} close={() => setConfigure(null)} done={async () => {
      setConfigure(null); await act({ action: 'sync', itemId: configure.id }, 'Bank connected. Review your transactions and add only your share.');
    }} />}
  </div>;
}
function ConfigureBank({ item, close, done }: { item: BankConnection; close: () => void; done: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const accountIds = form.getAll('sources').map(String);
    try { await bankRequest({ action: 'configure', itemId: item.id, accountIds, importFrom: String(form.get('importFrom')) }); await done(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save bank sources.'); setBusy(false); }
  }
  return <Modal title={'Link ' + item.name} close={busy ? () => undefined : close}><form className="space-y-4" onSubmit={submit}>
    <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Pull transactions from</legend>{item.accounts.map(bank => <label key={bank.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3"><input type="checkbox" name="sources" value={bank.id} defaultChecked className="h-5 min-h-0 w-5 shrink-0 accent-primary" /><span className="min-w-0 text-sm">{bank.name}{bank.mask ? ' · ' + bank.mask : ''}</span></label>)}</fieldset>
    <label className="field">Review transactions from<input name="importFrom" type="date" required defaultValue={today()} /></label>
    <p className="text-sm text-off_gray">Transactions before this date stay out of the review list. Bank sources are only used for importing; expenses have no payment account.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button className="btn-neutral" type="button" disabled={busy} onClick={close}>Later</button><button className="btn" disabled={busy}>{busy ? 'Connecting...' : 'Link selected sources'}</button></div>
  </form></Modal>;
}
