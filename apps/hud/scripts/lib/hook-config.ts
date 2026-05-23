import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANAGED_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PostToolUse',
  'Stop',
  'SubagentStop',
  'PreCompact',
] as const;

export type ManagedHookEvent = (typeof MANAGED_HOOK_EVENTS)[number];

export interface HookCommand {
  type: 'command';
  command: string;
}

export interface HookMatcher {
  matcher: string;
  hooks: HookCommand[];
}

export type HooksSection = Partial<Record<string, HookMatcher[]>>;

export interface ClaudeSettings {
  hooks?: HooksSection;
  [k: string]: unknown;
}

export function getRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // here = <repo>/apps/hud/scripts/lib
  return resolve(here, '..', '..', '..', '..');
}

export function getHookScriptAbsPath(): string {
  return join(getRepoRoot(), 'hooks', 'claude-hook.sh');
}

export function getSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

export function getSettingsBackupPath(): string {
  return `${getSettingsPath()}.bak`;
}

export function readSettings(): { exists: boolean; raw: string; data: ClaudeSettings } {
  const path = getSettingsPath();
  if (!existsSync(path)) {
    return { exists: false, raw: '', data: {} };
  }
  const raw = readFileSync(path, 'utf8');
  if (raw.trim().length === 0) {
    return { exists: true, raw, data: {} };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${path} as JSON: ${reason}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Expected a JSON object in ${path}, got ${typeof data}`);
  }
  return { exists: true, raw, data: data as ClaudeSettings };
}

export function writeSettingsWithBackup(next: ClaudeSettings): void {
  const path = getSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, getSettingsBackupPath());
  }
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

export function diffLines(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) {
      out.push(`  ${av ?? ''}`);
    } else {
      if (av !== undefined) out.push(`- ${av}`);
      if (bv !== undefined) out.push(`+ ${bv}`);
    }
  }
  return out.join('\n');
}

function isHudHookCommand(hookScriptAbsPath: string, cmd: unknown): boolean {
  return (
    typeof cmd === 'object' &&
    cmd !== null &&
    (cmd as HookCommand).type === 'command' &&
    typeof (cmd as HookCommand).command === 'string' &&
    (cmd as HookCommand).command.includes(hookScriptAbsPath)
  );
}

function buildHudMatcher(hookScriptAbsPath: string): HookMatcher {
  return {
    matcher: '*',
    hooks: [{ type: 'command', command: hookScriptAbsPath }],
  };
}

export function withHudHooksInstalled(
  settings: ClaudeSettings,
  hookScriptAbsPath: string,
): ClaudeSettings {
  const next: ClaudeSettings = JSON.parse(JSON.stringify(settings));
  const hooks: HooksSection = next.hooks ?? {};
  const desired = buildHudMatcher(hookScriptAbsPath);

  for (const event of MANAGED_HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as HookMatcher[]) : [];
    const cleaned = existing
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return entry;
        const filteredHooks = entry.hooks.filter((h) => !isHudHookCommand(hookScriptAbsPath, h));
        if (filteredHooks.length === 0) return null;
        return { ...entry, hooks: filteredHooks };
      })
      .filter((e): e is HookMatcher => e !== null);
    cleaned.push(desired);
    hooks[event] = cleaned;
  }

  next.hooks = hooks;
  return next;
}

export function withHudHooksRemoved(
  settings: ClaudeSettings,
  hookScriptAbsPath: string,
): ClaudeSettings {
  const next: ClaudeSettings = JSON.parse(JSON.stringify(settings));
  const hooks = next.hooks;
  if (!hooks || typeof hooks !== 'object') return next;

  for (const event of MANAGED_HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? (hooks[event] as HookMatcher[]) : null;
    if (!existing) continue;
    const cleaned = existing
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return entry;
        const filteredHooks = entry.hooks.filter((h) => !isHudHookCommand(hookScriptAbsPath, h));
        if (filteredHooks.length === 0) return null;
        return { ...entry, hooks: filteredHooks };
      })
      .filter((e): e is HookMatcher => e !== null);
    if (cleaned.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = cleaned;
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete next.hooks;
  }
  return next;
}

export function renderSettings(data: ClaudeSettings): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}
