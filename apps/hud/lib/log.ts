import { mkdir } from 'node:fs/promises';
import { open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import type { BusEnvelope } from './bus';

const DATA_DIR = join(process.cwd(), 'data');

function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function pathForDay(dayKey: string): string {
  return join(DATA_DIR, `events-${dayKey}.jsonl`);
}

let mkdirPromise: Promise<void> | null = null;
let currentHandle: FileHandle | null = null;
let currentDayKey: string | null = null;
let writeChain: Promise<void> = Promise.resolve();

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
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code ?? 'unknown';
      console.error(`log: jsonl append failed (code=${code})`);
    }
  });
  await writeChain;
}
