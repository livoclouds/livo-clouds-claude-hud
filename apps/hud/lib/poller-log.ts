// File-based logger for sidecar poller processes.
//
// Redirects a poller's stdout/stderr to a dedicated file (e.g.
// logs/poller-sessions.log) with 10 MB / 3-generation size-based rotation.
// Writes are queued through a serialised promise chain so concurrent chunks
// from a busy poller never interleave.

import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export class PollerLogger {
  private stream: WriteStream | null = null;
  private bytesWritten = 0;
  private rotating = false;
  private chain: Promise<void> = Promise.resolve();
  private dirReady: Promise<void> | null = null;

  constructor(
    private readonly logPath: string,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES,
  ) {}

  private ensureDir(): Promise<void> {
    if (!this.dirReady) {
      this.dirReady = mkdir(dirname(this.logPath), { recursive: true }).then(() => undefined);
    }
    return this.dirReady;
  }

  private openStream(): void {
    if (this.stream) return;
    this.stream = createWriteStream(this.logPath, { flags: 'a' });
    this.stream.on('error', (err) => {
      console.error(`poller-log: write error on ${this.logPath}: ${err.message}`);
      this.stream = null;
    });
  }

  private async rotate(): Promise<void> {
    if (this.rotating) return;
    this.rotating = true;
    try {
      // Close current stream before renaming.
      if (this.stream) {
        const s = this.stream;
        this.stream = null;
        await new Promise<void>((resolve) => s.end(resolve));
      }
      // Shift generations: .2 → .3, .1 → .2, active → .1
      for (let i = 2; i >= 1; i--) {
        try {
          await rename(`${this.logPath}.${i}`, `${this.logPath}.${i + 1}`);
        } catch {
          // may not exist
        }
      }
      try {
        await rename(this.logPath, `${this.logPath}.1`);
      } catch {
        // may not exist yet
      }
      this.bytesWritten = 0;
      this.openStream();
    } finally {
      this.rotating = false;
    }
  }

  write(chunk: Buffer): void {
    this.chain = this.chain.then(async () => {
      await this.ensureDir();
      if (!this.stream) this.openStream();
      if (!this.stream) return;

      // Check if rotation is needed before this write.
      if (this.bytesWritten + chunk.byteLength >= this.maxBytes) {
        // Verify actual file size in case the stream was reopened.
        try {
          const { size } = await stat(this.logPath);
          if (size >= this.maxBytes) await this.rotate();
        } catch {
          // If stat fails, rotate anyway based on our counter.
          if (this.bytesWritten >= this.maxBytes) await this.rotate();
        }
      }

      await new Promise<void>((resolve, reject) => {
        if (!this.stream) { resolve(); return; }
        const ok = this.stream.write(chunk, (err) => {
          if (err) reject(err);
          else resolve();
        });
        if (!ok) {
          // Drain event will be emitted; the write callback still fires.
        }
      });
      this.bytesWritten += chunk.byteLength;
    }).catch((err: unknown) => {
      console.error(
        `poller-log: failed to write to ${this.logPath}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  async close(): Promise<void> {
    // Wait for queued writes, then close the stream.
    await this.chain;
    if (this.stream) {
      const s = this.stream;
      this.stream = null;
      await new Promise<void>((resolve) => s.end(resolve));
    }
  }
}
