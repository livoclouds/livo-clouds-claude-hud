// Timing constants for the mascot state machine.
// All values in milliseconds; centralised here so tests and runtime agree.

export const IDLE_TIMEOUT_MS = 30_000;
export const LISTEN_WINDOW_MS = 1_500;
export const SUCCEEDED_WINDOW_MS = 6_000;
export const ERRORED_WINDOW_MS = 8_000;
export const COMPACT_END_WINDOW_MS = 1_500;

// Cap on how many recent envelopes the store and derivation keep in memory.
export const RECENT_EVENTS_CAP = 16;

// How far back deriveMascotState will scan when looking past a stale
// compact.end to find the underlying activity state.
export const LOOKBACK_LIMIT = 8;
