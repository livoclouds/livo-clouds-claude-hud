export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1_000) return Math.round(n).toLocaleString('en-US');
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 2 : 1)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '$0.00';
  if (usd < 10) return `$${usd.toFixed(4)}`;
  if (usd < 1_000) return `$${usd.toFixed(2)}`;
  return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatPct(pct: number): string {
  if (!Number.isFinite(pct) || pct < 0) return '0%';
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  return i === -1 ? trimmed : trimmed.slice(i + 1);
}

export function relativeTime(fromTs: number, nowTs: number = Date.now()): string {
  const diffMs = Math.max(0, nowTs - fromTs);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
