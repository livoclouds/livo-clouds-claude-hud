'use client';

import { useCallback, useEffect, useState } from 'react';

// Per-device pin list. Stored in localStorage so pinning works without a
// server endpoint. SSR-safe: the initial render returns an empty Set; pins
// hydrate on first client effect.
//
// localStorage is per-origin / per-device — pins on the Mac browser do not
// propagate to the iPad. Documented in the PR as a known limitation.

const AGENTS_KEY = 'livo-hud-pinned-agents-v1';
const CODE_SESSIONS_KEY = 'livo-hud-pinned-code-sessions-v1';

function read(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

function write(key: string, pins: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...pins]));
  } catch {
    // Quota exceeded / privacy mode — pins simply don't persist this turn.
  }
}

function useLocalStoragePinSet(storageKey: string): {
  pins: ReadonlySet<string>;
  isPinned: (name: string) => boolean;
  toggle: (name: string) => void;
} {
  const [pins, setPins] = useState<Set<string>>(() => new Set());

  // Hydrate on mount. Server render emits the empty set so HTML matches.
  useEffect(() => {
    setPins(read(storageKey));
  }, [storageKey]);

  // Cross-tab sync: pins from another tab on the same device are picked up.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      setPins(read(storageKey));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const toggle = useCallback(
    (name: string) => {
      setPins((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        write(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const isPinned = useCallback((name: string) => pins.has(name), [pins]);

  return { pins, isPinned, toggle };
}

// Subagent pins (keyed by agent name) — powers the existing AgentsDashboard.
export function usePinnedAgents() {
  return useLocalStoragePinSet(AGENTS_KEY);
}

// Claude Code session pins (keyed by sessionId) — powers the SessionsDashboard.
// Pinning by sessionId is more stable than by name because the same `name`
// can be reused across reopened sessions, and sessionId is what the on-disk
// `~/.claude/sessions/<pid>.json` exposes.
export function usePinnedCodeSessions() {
  return useLocalStoragePinSet(CODE_SESSIONS_KEY);
}
