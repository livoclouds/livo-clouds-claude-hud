'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { createHudStore, type HudState, type HudStoreApi } from '@/lib/store';
import { useEventStream, type SseStatus } from '@/lib/sse-client';

// ─── Contexts ────────────────────────────────────────────────────────────────

const HudStoreContext = createContext<HudStoreApi | null>(null);
const SseStatusContext = createContext<SseStatus>('connecting');
const HudHydrationContext = createContext<boolean>(false);
// Stable reconnect callback — triggers an immediate SSE re-open (used by PullToRefresh).
const HudReconnectContext = createContext<() => void>(() => {});

// ─── HudStoreProvider ─────────────────────────────────────────────────────────
// Outer layer: stable forever. Creates the Zustand store once and never
// re-renders again, so consumers that only read store state are insulated from
// SSE reconnect churn.

function HudStoreProvider({
  initial,
  children,
}: {
  initial: HudState;
  children: ReactNode;
}) {
  const storeRef = useRef<HudStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createHudStore(initial);
  }
  return (
    <HudStoreContext.Provider value={storeRef.current}>
      {children}
    </HudStoreContext.Provider>
  );
}

// ─── HudConnectionProvider ───────────────────────────────────────────────────
// Inner layer: manages SSE connection state and hydration flag. Re-renders on
// reconnect, but HudStoreProvider above it does not, so pure store consumers
// are unaffected.

function HudConnectionProvider({ children }: { children: ReactNode }) {
  const store = useHudStoreApi();

  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const onStatusChange = useCallback((s: SseStatus) => setSseStatus(s), []);

  const { reconnect } = useEventStream(store, { onStatusChange });

  // Mark hydrated on the client so reduced-motion / time-based UI can mount
  // after the first paint without producing a server/client mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <HudReconnectContext.Provider value={reconnect}>
      <SseStatusContext.Provider value={sseStatus}>
        <HudHydrationContext.Provider value={hydrated}>{children}</HudHydrationContext.Provider>
      </SseStatusContext.Provider>
    </HudReconnectContext.Provider>
  );
}

// ─── Public provider ──────────────────────────────────────────────────────────
// Thin composition wrapper that preserves the existing public API.

export function HudProvider({
  initial,
  children,
}: {
  initial: HudState;
  children: ReactNode;
}) {
  return (
    <HudStoreProvider initial={initial}>
      <HudConnectionProvider>{children}</HudConnectionProvider>
    </HudStoreProvider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useHudHydrated(): boolean {
  return useContext(HudHydrationContext);
}

export function useSseStatus(): SseStatus {
  return useContext(SseStatusContext);
}

export function useHudReconnect(): () => void {
  return useContext(HudReconnectContext);
}

function useHudStoreApi(): HudStoreApi {
  const store = useContext(HudStoreContext);
  if (!store) {
    throw new Error('useHudStore must be used inside <HudProvider>.');
  }
  return store;
}

export function useHud<T>(selector: (state: HudState) => T): T {
  const store = useHudStoreApi();
  return useStore(store, (s) => selector(s));
}
