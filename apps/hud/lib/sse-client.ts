'use client';

import { useCallback, useEffect, useRef } from 'react';
import { HudEventSchema } from '@livoclouds/contracts';
import type { HudStoreApi } from './store';

const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 5_000;
// After this many consecutive failed attempts we escalate the store's
// connection state from "reconnecting" to "disconnected" — the user has been
// offline long enough that ConnectionBanner switches to its more prominent
// "Disconnected" copy.
const DISCONNECTED_AFTER_ATTEMPTS = 3;

type Connection = {
  source: EventSource;
  cleanup: () => void;
};

function attach(url: string, store: HudStoreApi): Connection {
  const source = new EventSource(url);
  let disposed = false;

  const onMessage = (evt: MessageEvent<string>) => {
    if (disposed) return;
    if (!evt.data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      return;
    }
    const result = HudEventSchema.safeParse(parsed);
    if (!result.success) return;
    const id = evt.lastEventId;
    if (!id) return;
    store.getState().actions.apply({ id, event: result.data });
  };

  const onTruncated = () => {
    if (disposed) return;
    store.getState().actions.markReplayTruncated();
  };

  const onBpDisconnect = () => {
    if (disposed) return;
    console.info('sse-client: server closed connection for backpressure; will reconnect with Last-Event-ID');
  };

  source.addEventListener('message', onMessage);
  source.addEventListener('stream-replay-truncated', onTruncated);
  source.addEventListener('bp-disconnect', onBpDisconnect);

  return {
    source,
    cleanup: () => {
      disposed = true;
      source.removeEventListener('message', onMessage);
      source.removeEventListener('stream-replay-truncated', onTruncated);
      source.removeEventListener('bp-disconnect', onBpDisconnect);
      try {
        source.close();
      } catch {
        // ignore
      }
    },
  };
}

// Lifecycle signal consumed by HudProvider → SseStatusBadge (small always-on
// health indicator in the StatusBar). The store-based `connectionState`
// (used by ConnectionBanner) is dispatched in parallel — they're two views of
// the same lifecycle: a subtle pill that's always present and a prominent
// banner that only appears during outages.
export type SseStatus = 'connecting' | 'open' | 'reconnecting';

export type UseEventStreamOptions = {
  url?: string;
  onStatusChange?: (status: SseStatus) => void;
};

export type UseEventStreamResult = {
  reconnect: () => void;
};

export function useEventStream(store: HudStoreApi, opts: UseEventStreamOptions = {}): UseEventStreamResult {
  const url = opts.url ?? '/api/stream';
  const { onStatusChange } = opts;

  // Stable ref so callers always hold a live pointer to reopenNow even across
  // re-renders, without the function itself being a reactive dependency.
  const reopenRef = useRef<() => void>(() => {});

  useEffect(() => {
    let connection: Connection | null = null;
    let backoffAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const notify = (status: SseStatus) => {
      if (cancelled) return;
      onStatusChange?.(status);
    };

    const setConnectionState = (state: 'connected' | 'reconnecting' | 'disconnected') => {
      if (cancelled) return;
      store.getState().actions.setConnectionState(state);
    };

    const clearTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      notify('reconnecting');
      // ±30% jitter spreads reconnects across concurrent clients so they don't
      // all hit the server at the same moment after a restart (O8).
      const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** backoffAttempt);
      const delay = base * (0.85 + Math.random() * 0.30);
      backoffAttempt += 1;
      setConnectionState(
        backoffAttempt >= DISCONNECTED_AFTER_ATTEMPTS ? 'disconnected' : 'reconnecting',
      );
      clearTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
    };

    const open = () => {
      if (cancelled) return;
      if (connection) {
        connection.cleanup();
        connection = null;
      }
      const conn = attach(url, store);
      connection = conn;

      conn.source.addEventListener('open', () => {
        backoffAttempt = 0;
        notify('open');
        setConnectionState('connected');
      });

      conn.source.addEventListener('error', () => {
        // EventSource auto-reconnects, but on persistent failures it stays CLOSED.
        // We close + back off ourselves so the browser sends Last-Event-ID on the
        // next open from the last `id:` frame it saw.
        if (cancelled) return;
        if (conn.source.readyState === EventSource.CLOSED) {
          conn.cleanup();
          if (connection === conn) connection = null;
          scheduleReconnect();
        }
      });
    };

    const reopenNow = () => {
      if (cancelled) return;
      if (connection) {
        connection.cleanup();
        connection = null;
      }
      clearTimer();
      backoffAttempt = 0;
      notify('connecting');
      open();
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      // iPad Safari may suspend backgrounded EventSources; reopen on return.
      if (!connection || connection.source.readyState === EventSource.CLOSED) {
        reopenNow();
      }
    };

    const onOnline = () => {
      // The browser thinks we're back on the network. Cancel any pending
      // backoff and reconnect immediately so the banner clears as soon as
      // possible. Always tears down the prior EventSource first so we never
      // end up with duplicate subscriptions.
      if (cancelled) return;
      reopenNow();
    };

    const onOffline = () => {
      // No point waiting for SSE to time out — flag the UI right away.
      if (cancelled) return;
      setConnectionState('disconnected');
      notify('reconnecting');
    };

    reopenRef.current = reopenNow;
    notify('connecting');
    open();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelled = true;
      reopenRef.current = () => {};
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearTimer();
      if (connection) {
        connection.cleanup();
        connection = null;
      }
    };
  }, [store, url, onStatusChange]);

  const reconnect = useCallback(() => reopenRef.current(), []);
  return { reconnect };
}
