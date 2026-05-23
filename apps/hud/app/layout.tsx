import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from './_components/ThemeProvider';
import { Gestures } from './_components/Gestures';
import { NavBar } from './_components/NavBar';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <Gestures>
            <div className="pb-28">{children}</div>
          </Gestures>
          <NavBar />
        </ThemeProvider>
      </body>
    </html>
  );
}
