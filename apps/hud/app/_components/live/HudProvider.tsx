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

const HudStoreContext = createContext<HudStoreApi | null>(null);
const SseStatusContext = createContext<SseStatus>('connecting');

export function HudProvider({
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
  const store = storeRef.current;

  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const onStatusChange = useCallback((s: SseStatus) => setSseStatus(s), []);

  useEventStream(store, { onStatusChange });

  // Mark hydrated on the client so reduced-motion / time-based UI can mount
  // after the first paint without producing a server/client mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <HudStoreContext.Provider value={store}>
      <SseStatusContext.Provider value={sseStatus}>
        <HudHydrationContext.Provider value={hydrated}>{children}</HudHydrationContext.Provider>
      </SseStatusContext.Provider>
    </HudStoreContext.Provider>
  );
}

const HudHydrationContext = createContext<boolean>(false);

export function useHudHydrated(): boolean {
  return useContext(HudHydrationContext);
}

export function useSseStatus(): SseStatus {
  return useContext(SseStatusContext);
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
