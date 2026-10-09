'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Squares2X2Icon, BanknotesIcon, CreditCardIcon, DocumentCurrencyDollarIcon, Cog8ToothIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useVault } from '@/app/ui/providers';
import PageLoading from '@/app/ui/pageLoading';
const pages = [
  { name: 'Dashboard', href: '/dashboard', icon: Squares2X2Icon },
  { name: 'Spending', href: '/spending', icon: BanknotesIcon },
  { name: 'Wallet', href: '/wallet', icon: CreditCardIcon },
  { name: 'Bills', href: '/bills', icon: DocumentCurrencyDollarIcon },
  { name: 'Settings', href: '/settings', icon: Cog8ToothIcon },
];
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, dataLoading, error, logout } = useVault();
  const router = useRouter(); const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const navigating = isPending && pendingPath !== pathname;
  const activePath = navigating && pendingPath ? pendingPath : pathname;
  const pageTitle = pages.find(page => page.href === activePath)?.name;
  const navigate = (href: string) => {
    if (href === pathname && !isPending) return;
    setPendingPath(href);
    startTransition(() => router.push(href));
  };
  useEffect(() => {
    if (!loading && !user) {
      const returningFromBank = pathname === '/wallet' && new URLSearchParams(window.location.search).has('oauth_state_id');
      router.replace(returningFromBank ? `/login?next=${encodeURIComponent(pathname + window.location.search)}` : '/login');
    }
  }, [user, loading, router, pathname]);
  if (loading || !user) return <div role="status" className="grid min-h-dvh place-items-center text-off_gray">Opening your vault…</div>;
  const links = pages.map(page => <Link key={page.href} href={page.href} prefetch onNavigate={event => { event.preventDefault(); navigate(page.href); }} aria-current={activePath === page.href ? 'page' : undefined} className={clsx('nav-link', activePath === page.href && 'nav-active')}><page.icon className="h-5 w-5 shrink-0" /><span>{page.name}</span></Link>);
  return <div className="min-h-dvh">
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-gray-200 bg-white p-6 md:flex">
      <Link href="/dashboard" onNavigate={event => { event.preventDefault(); navigate('/dashboard'); }} className="mb-10 font-display text-4xl font-bold tracking-tighter text-primary">Vault <span className="text-lg text-off_gray">Lite</span></Link>
      <nav className="space-y-2" aria-label="Main navigation">{links}</nav>
      <div className="mt-auto"><p className="mb-3 truncate text-xs text-off_gray">{user.email}</p><button className="nav-link w-full" onClick={() => void logout().catch(() => window.alert('Could not log out. Try again.'))}><ArrowRightStartOnRectangleIcon className="h-5 w-5" />Log out</button></div>
    </aside>
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 md:hidden"><Link href="/dashboard" onNavigate={event => { event.preventDefault(); navigate('/dashboard'); }} className="font-display text-2xl font-bold tracking-tighter text-primary">Vault Lite</Link><span className="text-xs text-off_gray">Your money, in focus</span></header>
    <main aria-busy={navigating || dataLoading} className="mx-auto max-w-[1600px] px-4 pb-28 pt-6 sm:px-8 md:ml-60 md:pb-10 lg:px-10 lg:pt-10">
      {error && <p role="alert" className="notice mb-5">{error}</p>}
      {navigating || dataLoading ? <PageLoading title={pageTitle} message={navigating ? `Opening ${pageTitle ?? 'page'}…` : 'Loading your finances…'} /> : children}
    </main>
    <nav aria-label="Mobile navigation" className="mobile-nav md:hidden">{links}</nav>
  </div>;
}
