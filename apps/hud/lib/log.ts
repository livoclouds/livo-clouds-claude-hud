import { mkdir, open, readdir, rename, stat, unlink, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import type { BusEnvelope } from './bus';

const DATA_DIR = join(process.cwd(), 'data');

function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function pathForDay(dayKey: string): string {
  return join(DATA_DIR, `events-${dayKey}.jsonl`);
}

const MAX_LOG_BYTES =
  parseInt(process.env.HUD_LOG_MAX_SIZE_MB ?? '100', 10) * 1024 * 1024;

const RETENTION_DAYS = (() => {
  const raw = process.env.HUD_LOG_RETENTION_DAYS;
  if (!raw) return 7;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
})();

let mkdirPromise: Promise<void> | null = null;
let currentHandle: FileHandle | null = null;
let currentDayKey: string | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function pruneOldRotations(): Promise<void> {
  const cutoffMs = Date.now() - RETENTION_DAYS * 86_400_000;
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return; // data dir may not exist yet
  }
  for (const name of entries) {
    // Only delete rotated generation files (.N suffix), never the active log.
    if (!/^events-\d{4}-\d{2}-\d{2}\.jsonl\.\d+$/.test(name)) continue;
    const fullPath = join(DATA_DIR, name);
    try {
      const { mtimeMs } = await stat(fullPath);
      if (mtimeMs < cutoffMs) {
        await unlink(fullPath);
      }
    } catch {
      // best-effort: file may have been removed concurrently
    }
  }
}

async function rotateDailyLog(dayKey: string): Promise<void> {
  const base = pathForDay(dayKey);
  if (currentHandle) {
    const stale = currentHandle;
    currentHandle = null;
    currentDayKey = null;
    try {
      await stale.close();
    } catch {
      // best-effort
    }
  }
  // Shift rotated generations: .2 → .3, .1 → .2, active → .1
  for (let i = 2; i >= 1; i--) {
    try {
      await rename(`${base}.${i}`, `${base}.${i + 1}`);
    } catch {
      // may not exist yet
    }
  }
  try {
    await rename(base, `${base}.1`);
  } catch {
    // may not exist yet
  }

  // Delete rotated files that have aged past the retention window.
  try {
    await pruneOldRotations();
  } catch {
    // best-effort: do not surface retention failures to callers
  }
}

async function ensureDir(): Promise<void> {
  if (!mkdirPromise) {
    mkdirPromise = mkdir(DATA_DIR, { recursive: true }).then(() => undefined);
  }
  await mkdirPromise;
}

async function handleForDay(dayKey: string): Promise<FileHandle> {
  if (currentHandle && currentDayKey === dayKey) return currentHandle;
  if (currentHandle && currentDayKey !== dayKey) {
    const stale = currentHandle;
    currentHandle = null;
    currentDayKey = null;
    try {
      await stale.close();
    } catch {
      // best-effort; do not surface
    }
  }
  await ensureDir();
  const handle = await open(pathForDay(dayKey), 'a');
  currentHandle = handle;
  currentDayKey = dayKey;
  return handle;
}

export async function appendEvent(envelope: BusEnvelope): Promise<void> {
  const dayKey = utcDateKey();
  const line =
    JSON.stringify({
      id: envelope.id,
      receivedAt: Date.now(),
      event: envelope.event,
    }) + '\n';

  writeChain = writeChain.then(async () => {
    try {
      const handle = await handleForDay(dayKey);
      await handle.write(line);
      try {
        const { size } = await handle.stat();
        if (size >= MAX_LOG_BYTES) await rotateDailyLog(dayKey);
      } catch {
        // best-effort: do not surface rotation failures to callers
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code ?? 'unknown';
      console.error(`log: jsonl append failed (code=${code})`);
      throw err; // propagate so callers can surface the failure (I3)
    }
  });
  await writeChain;
}

/**
 * Waits for all in-flight JSONL writes to complete, up to `timeoutMs`.
 * Used during graceful shutdown to avoid partial log lines on disk.
 */
export function drainLogWrites(timeoutMs: number): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([writeChain, timeout]);
}

/**
 * Returns the combined size of all JSONL log files in the data directory,
 * in megabytes. Returns 0 if the directory does not exist or is empty.
 */
export async function diskUsageMb(): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(DATA_DIR);
  } catch {
    return 0;
  }
  let totalBytes = 0;
  for (const name of entries) {
    if (!name.startsWith('events-') || !name.includes('.jsonl')) continue;
    try {
      const { size } = await stat(join(DATA_DIR, name));
      totalBytes += size;
    } catch {
      // file removed between readdir and stat
    }
  }
  return totalBytes / (1024 * 1024);
}
