import type { Metadata, Viewport } from 'next';
import './ui/global.css';
import { Providers } from './ui/providers';
import { Pwa } from './ui/pwa';
import { dmSans, outfit } from './ui/fonts';
export const metadata: Metadata = {
  title: { default: 'Vault Lite', template: '%s | Vault Lite' },
  description: 'Your spending, cards, and cash. All in one place.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Vault Lite' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#b91c1c', viewportFit: 'cover' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Extensions such as ColorZilla add attributes to body before hydration.
          Suppression applies only to this element, not the app's descendants. */}
      <body className={`${outfit.variable} ${dmSans.variable}`} suppressHydrationWarning>
        <Providers>{children}</Providers>
        <Pwa />
      </body>
    </html>
  );
}
