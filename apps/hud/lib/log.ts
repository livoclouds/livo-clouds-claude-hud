import { mkdir, open, rename, type FileHandle } from 'node:fs/promises';
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

let mkdirPromise: Promise<void> | null = null;
let currentHandle: FileHandle | null = null;
let currentDayKey: string | null = null;
let writeChain: Promise<void> = Promise.resolve();

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
