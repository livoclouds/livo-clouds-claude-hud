#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env.local');
const KEY = 'HUD_INGEST_TOKEN';

function fingerprint(token) {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function parseEnv(text) {
  const lines = text.split(/\r?\n/);
  const entries = new Map();
  for (const line of lines) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) entries.set(match[1], match[2]);
  }
  return { lines, entries };
}

function writeAtomic(targetPath, contents) {
  const tmp = `${targetPath}.tmp-${process.pid}`;
  writeFileSync(tmp, contents, { mode: 0o600 });
  renameSync(tmp, targetPath);
}

function main() {
  let existingText = '';
  if (existsSync(ENV_PATH)) {
    existingText = readFileSync(ENV_PATH, 'utf8');
  }
  const parsed = parseEnv(existingText);
  const existing = parsed.entries.get(KEY);

  if (existing && existing.length > 0) {
    console.log(
      `${KEY} already set in apps/hud/.env.local (sha256: ${fingerprint(existing)}). No changes.`,
    );
    return;
  }

  const token = randomBytes(32).toString('hex');
  const newLine = `${KEY}=${token}`;

  let nextLines;
  if (parsed.entries.has(KEY)) {
    nextLines = parsed.lines.map((line) => (/^HUD_INGEST_TOKEN=/.test(line) ? newLine : line));
  } else {
    const trimmed = parsed.lines.filter(
      (_, i) => i < parsed.lines.length - 1 || parsed.lines[i] !== '',
    );
    nextLines = [...trimmed, newLine, ''];
  }
  const contents = nextLines.join('\n');

  writeAtomic(ENV_PATH, contents);
  console.log(
    `${KEY} written to apps/hud/.env.local (sha256: ${fingerprint(token)}). Length: ${token.length} chars.`,
  );
}

main();
