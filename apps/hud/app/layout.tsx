import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Claude Code HUD',
  description: 'Real-time HUD for Claude Code sessions',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
