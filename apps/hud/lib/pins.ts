'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'livo-hud-pinned-agents-v1';

// Per-device pin list for the agents dashboard. Stored in localStorage so
// pinning works without a server endpoint. SSR-safe: the initial render
// returns an empty Set; pins hydrate on first client effect.
//
// localStorage is per-origin / per-device — pins on the Mac browser do not
// propagate to the iPad. Documented in the PR as a known limitation.

function read(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

function write(pins: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...pins]));
  } catch {
    // Quota exceeded / privacy mode — pins simply don't persist this turn.
  }
}

export function usePinnedAgents(): {
  pins: ReadonlySet<string>;
  isPinned: (name: string) => boolean;
  toggle: (name: string) => void;
} {
  const [pins, setPins] = useState<Set<string>>(() => new Set());

  // Hydrate on mount. Server render emits the empty set so HTML matches.
  useEffect(() => {
    setPins(read());
  }, []);

  // Cross-tab sync: pins from another tab on the same device are picked up.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setPins(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((name: string) => {
    setPins((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      write(next);
      return next;
    });
  }, []);

  const isPinned = useCallback((name: string) => pins.has(name), [pins]);

  return { pins, isPinned, toggle };
}
