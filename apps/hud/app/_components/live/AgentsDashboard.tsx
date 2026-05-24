'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useHud, useHudHydrated } from './HudProvider';
import { useAgentDetailSheet } from './AgentDetailSheet';
import { usePinnedAgents } from '@/lib/pins';
import type { HudAgent, HudAgentStatus } from '@/lib/store';
import { relativeTime, truncate } from '@/lib/format';

// Built-in agent name → dot color. Used when the agent definition does not
// surface its own `color` to the HUD. Falls back to the status color below
// for any agent name not listed here.
const BUILTIN_COLORS: Record<string, string> = {
  Explore: '#7dd3fc',          // sky-300
  Plan: '#c4b5fd',             // violet-300
  'general-purpose': 'var(--color-hud-fg-muted)',
  claude: 'var(--color-hud-fg-soft)',
  'claude-code-guide': 'var(--color-hud-accent)',
  'statusline-setup': 'var(--color-hud-warn)',
};

const STATUS_COLOR: Record<HudAgentStatus, string> = {
  working: 'var(--color-hud-warn)',
  completed: 'var(--color-hud-success)',
  errored: 'var(--color-hud-critical)',
};

const STATUS_LABEL: Record<HudAgentStatus, string> = {
  working: 'Working',
  completed: 'Completed',
  errored: 'Errored',
};

function colorFor(agent: HudAgent): string {
  if (agent.color) return agent.color;
  return BUILTIN_COLORS[agent.name] ?? STATUS_COLOR[agent.status];
}

// Working first, then most recently active. Ties broken by name for stability.
function sortAgents(agents: ReadonlyArray<HudAgent>): HudAgent[] {
  return [...agents].sort((a, b) => {
    if (a.status === 'working' && b.status !== 'working') return -1;
    if (a.status !== 'working' && b.status === 'working') return 1;
    const aTs = a.endedAt ?? a.startedAt;
    const bTs = b.endedAt ?? b.startedAt;
    if (aTs !== bTs) return bTs - aTs;
    return a.name.localeCompare(b.name);
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return rs === 0 ? `${m}m` : `${m}m${rs}s`;
}

function PinButton({
  pinned,
  onToggle,
  agentName,
}: {
  pinned: boolean;
  onToggle: () => void;
  agentName: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={pinned ? `Unpin ${agentName}` : `Pin ${agentName}`}
      title={pinned ? 'Unpin' : 'Pin'}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--color-hud-fg-muted)] hover:text-[color:var(--color-hud-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
      style={pinned ? { color: 'var(--color-hud-accent)' } : undefined}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Pushpin */}
        <path d="M12 17v5" />
        <path d="M5 17h14l-2-5V5H7v7l-2 5Z" />
      </svg>
    </button>
  );
}

function AgentCard({
  agent,
  now,
  hydrated,
  pinned,
  onPinToggle,
}: {
  agent: HudAgent;
  now: number;
  hydrated: boolean;
  pinned: boolean;
  onPinToggle: () => void;
}) {
  const { show } = useAgentDetailSheet();
  const dot = colorFor(agent);
  const statusColor = STATUS_COLOR[agent.status];
  const elapsedMs =
    agent.status === 'working'
      ? Math.max(0, now - agent.startedAt)
      : agent.durationMs ?? Math.max(0, (agent.endedAt ?? agent.startedAt) - agent.startedAt);

  return (
    <motion.div
      key={agent.name}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      role="button"
      tabIndex={0}
      onClick={() => show(agent.name)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          show(agent.name);
        }
      }}
      data-no-swipe="true"
      aria-label={`Open details for ${agent.name}`}
      className="hud-card flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-[color:color-mix(in_srgb,var(--color-hud-accent)_30%,var(--color-hud-card-border))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-hud-accent)]"
      style={{
        borderColor:
          agent.status === 'working'
            ? `color-mix(in srgb, ${dot} 38%, var(--color-hud-card-border))`
            : 'var(--color-hud-card-border)',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        className={agent.status === 'working' ? 'animate-pulse' : ''}
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          marginTop: 5,
          borderRadius: 999,
          background: dot,
          boxShadow:
            agent.status === 'working'
              ? `0 0 10px ${dot}`
              : `0 0 4px color-mix(in srgb, ${dot} 50%, transparent)`,
          flex: 'none',
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="hud-fg font-mono text-sm leading-tight"
            title={agent.description ?? agent.name}
          >
            {truncate(agent.name, 28)}
          </span>
          {agent.invocations > 1 && (
            <span
              className="hud-fg-muted rounded-full px-1.5 text-[10px] font-medium"
              style={{ background: 'var(--color-hud-card-bg)' }}
              title={`Invoked ${agent.invocations} times`}
            >
              ×{agent.invocations}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span style={{ color: statusColor }}>{STATUS_LABEL[agent.status]}</span>
          <span className="hud-fg-muted">·</span>
          <span className="hud-fg-muted">
            {agent.status === 'working'
              ? hydrated
                ? `${formatDuration(elapsedMs)} elapsed`
                : '…'
              : `${formatDuration(elapsedMs)}${
                  agent.status === 'completed'
                    ? hydrated && agent.endedAt
                      ? ` · ${relativeTime(agent.endedAt, now)}`
                      : ''
                    : ''
                }`}
          </span>
        </div>
      </div>
      <PinButton pinned={pinned} onToggle={onPinToggle} agentName={agent.name} />
    </motion.div>
  );
}

export function AgentsDashboard() {
  const agentsMap = useHud((s) => s.agents);
  const claudeCodeVersion = useHud((s) => s.claudeCodeVersion);
  const defaultModel = useHud((s) => s.defaultModel);
  const hydrated = useHudHydrated();
  const { isPinned, toggle } = usePinnedAgents();
  const [now, setNow] = useState(() => Date.now());

  const sorted = useMemo(() => sortAgents(Object.values(agentsMap)), [agentsMap]);
  const hasWorking = sorted.some((a) => a.status === 'working');

  // Partition by pin only after client hydration — pre-hydration the pin set
  // is empty so SSR/CSR match exactly. Server always renders everything under
  // a single grid (no Pinned section).
  const { pinned, recent } = useMemo(() => {
    if (!hydrated) return { pinned: [] as HudAgent[], recent: sorted };
    const p: HudAgent[] = [];
    const r: HudAgent[] = [];
    for (const a of sorted) {
      if (isPinned(a.name)) p.push(a);
      else r.push(a);
    }
    return { pinned: p, recent: r };
  }, [sorted, isPinned, hydrated]);

  useEffect(() => {
    if (!hasWorking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasWorking]);

  const hasMeta = Boolean(claudeCodeVersion || defaultModel);

  return (
    <div className="hud-card p-6">
      <div className="flex items-baseline justify-between gap-4">
        <p className="hud-fg-muted text-xs uppercase tracking-wider">Agents</p>
        {hasMeta && (
          <div className="hud-fg-muted flex items-center gap-2 text-[11px] font-mono">
            {claudeCodeVersion && <span title="Claude Code version">v{claudeCodeVersion}</span>}
            {claudeCodeVersion && defaultModel && <span aria-hidden>·</span>}
            {defaultModel && <span title="Default model">default {defaultModel}</span>}
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="hud-fg-muted mt-4 text-sm">No agents invoked yet</p>
      ) : (
        <div className="mt-4 space-y-4">
          {pinned.length > 0 && (
            <section>
              <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
                Pinned
              </p>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {pinned.map((a) => (
                    <AgentCard
                      key={a.name}
                      agent={a}
                      now={now}
                      hydrated={hydrated}
                      pinned
                      onPinToggle={() => toggle(a.name)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <p className="hud-fg-muted text-[10px] uppercase tracking-wider">
                  Recent
                </p>
              )}
              <div
                className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${pinned.length > 0 ? 'mt-2' : ''}`}
              >
                <AnimatePresence initial={false}>
                  {recent.map((a) => (
                    <AgentCard
                      key={a.name}
                      agent={a}
                      now={now}
                      hydrated={hydrated}
                      pinned={false}
                      onPinToggle={() => toggle(a.name)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
