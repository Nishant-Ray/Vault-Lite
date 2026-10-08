'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useVault } from '@/app/ui/providers';
import Card from '@/app/ui/card';
export default function Login() {
  const { user, loading, login, configured, error: authError } = useVault();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try { await login(String(data.get('email')), String(data.get('password'))); router.replace('/dashboard'); }
    catch { setError('Unable to sign in. Check your email, password, access, and connection.'); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-dvh place-items-center p-5"><div className="w-full max-w-md">
    <p className="mb-8 text-center font-display text-5xl font-bold tracking-tighter text-primary">Vault<span className="text-off_black"> Lite</span></p>
    <Card><h1 className="text-2xl font-semibold">Welcome back</h1><p className="mb-6 mt-2 text-off_gray">A little clarity for your everyday money.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
        <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {(error || authError) && <p role="alert" className="text-sm text-red-700">{error || authError}</p>}
        <button className="btn w-full" disabled={!configured || busy || loading}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
    </Card><p className="mt-5 text-center text-sm text-off_gray">Your private space. One account, all your finances.</p>
  </div></main>;
}
