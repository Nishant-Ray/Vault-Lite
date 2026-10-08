'use client';
import { useState } from 'react';
import { useVault } from '@/app/ui/providers';
import Card from '@/app/ui/card';
export default function Settings() {
  const { user, accounts, expenses, bills, logout } = useVault(); const [error, setError] = useState('');
  function download() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), accounts, expenses, bills }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'vault-lite-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><h1 className="page-title mb-6">Settings</h1><div className="grid max-w-3xl gap-6">
    <Card><h2 className="section-title">Your account</h2><p className="mb-5 mt-3 break-all text-sm text-off_gray">Signed in as {user?.email}</p>{error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}<button className="btn-neutral" onClick={() => void logout().catch(() => setError('Could not log out. Try again.'))}>Log out</button></Card>
    <Card><h2 className="section-title">Keep a copy</h2><p className="mb-5 mt-3 text-sm leading-relaxed text-off_gray">Download your accounts, expenses, and bills as a JSON backup. For a spreadsheet, export your filtered expenses from Spending. Store downloads somewhere private.</p><button className="btn-neutral" onClick={download}>Download backup</button></Card>
    <Card><h2 className="section-title">Add Vault to your home screen</h2><div className="mt-3 space-y-3 text-sm leading-relaxed text-off_gray"><p><strong className="text-off_black">iPhone / iPad:</strong> Open Vault in Safari, tap Share, then Add to Home Screen.</p><p><strong className="text-off_black">Android:</strong> Open Vault in Chrome and choose Install app or Add to Home screen from the browser menu.</p><p><strong className="text-off_black">Desktop:</strong> Use the install icon in Chrome or Edge’s address bar when available.</p><p>Installation requires a production build served over HTTPS (or localhost). An internet connection is needed to load financial data and save changes.</p></div></Card>
  </div></>;
}
