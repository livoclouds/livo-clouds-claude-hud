import type { HudState } from './store';

// Module-level selector constants. Import and pass to useHud(selector) so the
// same function reference is reused across renders instead of creating a new
// arrow function on every call. For selectors that return objects or arrays,
// wrap with useShallow from 'zustand/shallow' at the call site to avoid
// spurious re-renders from reference-equal-but-structurally-same values.

export const selectSession = (s: HudState) => s.session;
export const selectTokens = (s: HudState) => s.tokens;
export const selectCostUsd = (s: HudState) => s.costUsd;
export const selectContextPct = (s: HudState) => s.contextPct;
export const selectLastTool = (s: HudState) => s.lastTool;
export const selectLastError = (s: HudState) => s.lastError;
export const selectDefaultModel = (s: HudState) => s.defaultModel;
export const selectClaudeCodeVersion = (s: HudState) => s.claudeCodeVersion;
export const selectCodeSessions = (s: HudState) => s.codeSessions;
export const selectCodeSessionsUpdatedAt = (s: HudState) => s.codeSessionsUpdatedAt;
export const selectAgents = (s: HudState) => s.agents;
export const selectRecentEvents = (s: HudState) => s.recentEvents;
export const selectConnectionState = (s: HudState) => s.connectionState;
