'use client';
import { useEffect, useState } from 'react';
export function Pwa() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(console.error);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return offline ? <div role="status" className="fixed left-0 right-0 top-0 z-50 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">You’re offline. Connect to load data and save changes.</div> : null;
}
