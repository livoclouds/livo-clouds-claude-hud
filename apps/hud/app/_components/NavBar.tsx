'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

type NavItem = { href: string; label: string; glyph: string };

const ITEMS: ReadonlyArray<NavItem> = [
  { href: '/cost', label: 'Cost', glyph: '$' },
  { href: '/', label: 'Live', glyph: '✦' },
  { href: '/sessions', label: 'Sessions', glyph: '≡' },
  { href: '/mascot', label: 'Mascot', glyph: '◉' },
];

export function NavBar() {
  const pathname = usePathname() ?? '/';

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
    >
      <div className="pointer-events-auto hud-card flex items-center gap-1 px-2 py-2">
        {ITEMS.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-11 min-w-[64px] items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors ${
                active
                  ? 'bg-[var(--color-hud-accent)]/15 text-[color:var(--color-hud-fg)]'
                  : 'text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)]'
              }`}
            >
              <span
                aria-hidden
                className={
                  active
                    ? 'text-[color:var(--color-hud-accent)]'
                    : 'text-[color:var(--color-hud-fg-muted)]'
                }
              >
                {item.glyph}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <span className="mx-1 h-6 w-px bg-[var(--color-hud-card-border)]" aria-hidden />
        <ThemeToggle />
      </div>
    </nav>
  );
}
