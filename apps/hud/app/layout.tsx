import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { bus } from '@/lib/bus';
import { bootstrapSessionsSnapshot } from '@/lib/sessions-bootstrap';
import { reduceAll } from '@/lib/store';
import { ThemeProvider } from './_components/ThemeProvider';
import { Gestures } from './_components/Gestures';
import { NavBar } from './_components/NavBar';
import { ConnectionBanner } from './_components/ConnectionBanner';
import { ServiceWorkerRegistration } from './_components/ServiceWorkerRegistration';
import { HudProvider } from './_components/live/HudProvider';
import { StatusBar } from './_components/shell/StatusBar';

// iPad apple-touch-startup-image manifest. iOS ignores the PWA manifest's
// splash; it only honors per-resolution <link> tags whose media query matches
// the device's CSS pixel dimensions, pixel ratio, and orientation.
const APPLE_SPLASH = [
  // iPad 10.2 (810 x 1080 @ 2x)
  { href: '/splash/ipad-portrait-1620x2160.png',  width: 810,  height: 1080, ratio: 2, orientation: 'portrait' },
  { href: '/splash/ipad-landscape-2160x1620.png', width: 810,  height: 1080, ratio: 2, orientation: 'landscape' },
  // iPad Pro 11 (834 x 1194 @ 2x)
  { href: '/splash/ipad-portrait-1668x2388.png',  width: 834,  height: 1194, ratio: 2, orientation: 'portrait' },
  { href: '/splash/ipad-landscape-2388x1668.png', width: 834,  height: 1194, ratio: 2, orientation: 'landscape' },
  // iPad Pro 12.9 (1024 x 1366 @ 2x)
  { href: '/splash/ipad-portrait-2048x2732.png',  width: 1024, height: 1366, ratio: 2, orientation: 'portrait' },
  { href: '/splash/ipad-landscape-2732x2048.png', width: 1024, height: 1366, ratio: 2, orientation: 'landscape' },
] as const;

export const metadata: Metadata = {
  title: 'Claude Code HUD',
  description: 'Real-time HUD for Claude Code sessions',
  manifest: '/manifest.webmanifest',
  applicationName: 'Claude Code HUD',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HUD',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#f7f6f2' },
  ],
};

// Hydrate the HUD store from the in-memory ring buffer on every request so the
// status bar can render a meaningful snapshot before SSE catches up.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function RootLayout({ children }: { children: ReactNode }) {
  bootstrapSessionsSnapshot();
  const initial = reduceAll(bus.snapshot());

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {APPLE_SPLASH.map((s) => (
          <link
            key={s.href}
            rel="apple-touch-startup-image"
            href={s.href}
            media={`(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: ${s.orientation})`}
          />
        ))}
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <HudProvider initial={initial}>
            <ConnectionBanner />
            <StatusBar />
            <Gestures>
              <div className="pb-28">{children}</div>
            </Gestures>
            <NavBar />
          </HudProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
