import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { bus } from '@/lib/bus';
import { reduceAll } from '@/lib/store';
import { ThemeProvider } from './_components/ThemeProvider';
import { Gestures } from './_components/Gestures';
import { NavBar } from './_components/NavBar';
import { HudProvider } from './_components/live/HudProvider';
import { StatusBar } from './_components/shell/StatusBar';

export const metadata: Metadata = {
  title: 'Claude Code HUD',
  description: 'Real-time HUD for Claude Code sessions',
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
  const initial = reduceAll(bus.snapshot());

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <HudProvider initial={initial}>
            <StatusBar />
            <Gestures>
              <div className="pb-28">{children}</div>
            </Gestures>
            <NavBar />
          </HudProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
