'use client';
import { useState } from 'react';
import { useVault } from '@/app/ui/providers';
import Card from '@/app/ui/card';
import { bankRequest } from '@/app/lib/bank-client';
export default function Settings() {
  const { user, expenses, bills, logout } = useVault(); const [error, setError] = useState('');
  const [migrating, setMigrating] = useState(false), [migrationMessage, setMigrationMessage] = useState('');
  function downloadJson(data: unknown, name: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function download() {
    downloadJson({ version: 2, exportedAt: new Date().toISOString(), expenses, bills }, 'vault-lite-backup.json');
  }
  async function migrate() {
    setMigrating(true); setMigrationMessage('');
    try {
      const backup = await bankRequest({ action: 'export-legacy' });
      downloadJson(backup, 'vault-lite-before-migration.json');
      const result = await bankRequest<{ message: string }>({ action: 'migrate' }); setMigrationMessage(result.message);
    } catch (e) { setMigrationMessage(e instanceof Error ? e.message : 'Migration did not complete. Try again; existing amounts are preserved.'); }
    finally { setMigrating(false); }
  }
  return <><h1 className="page-title mb-6">Settings</h1><div className="grid max-w-3xl gap-6">
    <Card><h2 className="section-title">Your account</h2><p className="mb-5 mt-3 break-all text-sm text-off_gray">Signed in as {user?.email}</p>{error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}<button className="btn-neutral" onClick={() => void logout().catch(() => setError('Could not log out. Try again.'))}>Log out</button></Card>
    <Card><h2 className="section-title">Keep a copy</h2><p className="mb-5 mt-3 text-sm leading-relaxed text-off_gray">Download your personal expenses and bills as a JSON backup. For a spreadsheet, export your filtered expenses from Spending. Store downloads somewhere private.</p><button className="btn-neutral" onClick={download}>Download backup</button></Card>
    <Card><h2 className="section-title">Move existing history to personal spending</h2><p className="mb-5 mt-3 text-sm leading-relaxed text-off_gray">For data from the old account-based version: download a backup, then remove old account references. Expense amounts, bills, and bank connections are preserved. Review old expenses afterward and adjust any full charges to your own share.</p><button className="btn-neutral" disabled={migrating} onClick={() => void migrate()}>{migrating ? 'Migrating…' : 'Back up & migrate existing data'}</button>{migrationMessage && <p className="mt-4 text-sm text-off_gray" role="status">{migrationMessage}</p>}</Card>
    <Card><h2 className="section-title">Add Vault to your home screen</h2><div className="mt-3 space-y-3 text-sm leading-relaxed text-off_gray"><p><strong className="text-off_black">iPhone / iPad:</strong> Open Vault in Safari, tap Share, then Add to Home Screen.</p><p><strong className="text-off_black">Android:</strong> Open Vault in Chrome and choose Install app or Add to Home screen from the browser menu.</p><p><strong className="text-off_black">Desktop:</strong> Use the install icon in Chrome or Edge’s address bar when available.</p><p>Installation requires a production build served over HTTPS (or localhost). An internet connection is needed to load financial data and save changes.</p></div></Card>
  </div></>;
}
