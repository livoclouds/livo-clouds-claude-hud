'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

type NavItem = { href: string; label: string; glyph: string };

const ITEMS: ReadonlyArray<NavItem> = [
  { href: '/', label: 'Live', glyph: '✦' },
  { href: '/sessions', label: 'Sessions', glyph: '≡' },
  { href: '/cost', label: 'Cost', glyph: '$' },
  { href: '/mascot', label: 'Mascot', glyph: '◉' },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
}

export function NavBar() {
  const pathname = usePathname() ?? '/';

  return (
    <>
      {/* Bottom bar — mobile and tablet (hidden on desktop) */}
      <nav
        aria-label="Primary"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 lg:hidden"
      >
        <div className="pointer-events-auto hud-card flex items-center gap-1 px-2 py-2">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-11 min-w-[64px] items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors active:opacity-70 ${
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

      {/* Left sidebar — desktop (hidden below lg) */}
      <nav
        aria-label="Primary"
        className="fixed left-0 top-0 z-40 hidden h-full w-20 flex-col items-center border-r border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] py-4 backdrop-blur-[24px] lg:flex"
      >
        <div className="flex w-full flex-1 flex-col items-center gap-1 px-2">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition-colors active:opacity-70 ${
                  active
                    ? 'bg-[var(--color-hud-accent)]/15 text-[color:var(--color-hud-fg)]'
                    : 'text-[color:var(--color-hud-fg-soft)] hover:text-[color:var(--color-hud-fg)]'
                }`}
              >
                <span
                  aria-hidden
                  className={`text-base leading-none ${
                    active
                      ? 'text-[color:var(--color-hud-accent)]'
                      : 'text-[color:var(--color-hud-fg-muted)]'
                  }`}
                >
                  {item.glyph}
                </span>
                <span className="text-[10px] leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="px-2">
          <ThemeToggle />
        </div>
      </nav>
    </>
  );
}
