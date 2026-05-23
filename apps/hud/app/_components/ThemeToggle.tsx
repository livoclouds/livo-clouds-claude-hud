'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : true;
  const next = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-hud-card-border)] bg-[var(--color-hud-card-bg)] text-[color:var(--color-hud-fg-soft)] backdrop-blur-md transition-colors hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)] ${className}`}
    >
      {/* Render both icons; visibility hinges on mounted+theme to avoid SSR mismatch. */}
      <span aria-hidden className="text-base leading-none">
        {mounted ? (isDark ? '☾' : '☀') : '☾'}
      </span>
    </button>
  );
}
