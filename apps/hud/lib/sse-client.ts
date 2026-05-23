'use client';

import { useEffect } from 'react';
import { HudEventSchema } from '@livoclouds/contracts';
import type { HudStoreApi } from './store';

const BACKOFF_BASE_MS = 200;
const BACKOFF_CAP_MS = 5_000;

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

  source.addEventListener('message', onMessage);
  source.addEventListener('stream-replay-truncated', onTruncated);

  return {
    source,
    cleanup: () => {
      disposed = true;
      source.removeEventListener('message', onMessage);
      source.removeEventListener('stream-replay-truncated', onTruncated);
      try {
        source.close();
      } catch {
        // ignore
      }
    },
  };
}

export type UseEventStreamOptions = {
  url?: string;
};

export function useEventStream(store: HudStoreApi, opts: UseEventStreamOptions = {}): void {
  const url = opts.url ?? '/api/stream';

  useEffect(() => {
    let connection: Connection | null = null;
    let backoffAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clearTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** backoffAttempt);
      backoffAttempt += 1;
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

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      // iPad Safari may suspend backgrounded EventSources; reopen on return.
      if (!connection || connection.source.readyState === EventSource.CLOSED) {
        if (connection) connection.cleanup();
        connection = null;
        clearTimer();
        backoffAttempt = 0;
        open();
      }
    };

    open();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimer();
      if (connection) {
        connection.cleanup();
        connection = null;
      }
    };
  }, [store, url]);
}
