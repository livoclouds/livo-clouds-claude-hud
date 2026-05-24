'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useHud, useHudHydrated } from './HudProvider';
import type { HudAgent, HudAgentStatus } from '@/lib/store';
import { relativeTime, truncate } from '@/lib/format';

// Built-in agent name → dot color. Used when the agent definition does not
// surface its own `color` to the HUD (today nothing does; reserved for a
// future hook-side frontmatter parser). Falls back to the status color below
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

function AgentCard({ agent, now, hydrated }: { agent: HudAgent; now: number; hydrated: boolean }) {
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
      className="hud-card flex items-start gap-3 p-4"
      style={{
        borderColor:
          agent.status === 'working'
            ? `color-mix(in srgb, ${dot} 38%, var(--color-hud-card-border))`
            : 'var(--color-hud-card-border)',
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
            agent.status === 'working' ? `0 0 10px ${dot}` : `0 0 4px color-mix(in srgb, ${dot} 50%, transparent)`,
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
    </motion.div>
  );
}

export function AgentsDashboard() {
  const agentsMap = useHud((s) => s.agents);
  const claudeCodeVersion = useHud((s) => s.claudeCodeVersion);
  const defaultModel = useHud((s) => s.defaultModel);
  const hydrated = useHudHydrated();
  const [now, setNow] = useState(() => Date.now());

  const agents = useMemo(() => sortAgents(Object.values(agentsMap)), [agentsMap]);
  const hasWorking = agents.some((a) => a.status === 'working');

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

      <div className="mt-4">
        {agents.length === 0 ? (
          <p className="hud-fg-muted text-sm">No agents invoked yet</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {agents.map((a) => (
                <AgentCard key={a.name} agent={a} now={now} hydrated={hydrated} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
