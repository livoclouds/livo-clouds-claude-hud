#!/usr/bin/env node
import {
  deepEqual,
  diffLines,
  getHookScriptAbsPath,
  getSettingsBackupPath,
  getSettingsPath,
  readSettings,
  renderSettings,
  withHudHooksInstalled,
  writeSettingsWithBackup,
} from './lib/hook-config';

function parseFlags(argv: string[]): { dryRun: boolean } {
  return { dryRun: argv.includes('--dry-run') };
}

function main(): void {
  const { dryRun } = parseFlags(process.argv.slice(2));
  const hookScript = getHookScriptAbsPath();
  const settingsPath = getSettingsPath();

  let current;
  try {
    current = readSettings();
  } catch (err) {
    console.error(`install-hook: ${err instanceof Error ? err.message : String(err)}`);
    console.error(
      'Refusing to modify a settings file we cannot parse. ' +
        `Fix or restore from ${getSettingsBackupPath()} and re-run.`,
    );
    process.exit(1);
    return;
  }

  const next = withHudHooksInstalled(current.data, hookScript);

  if (deepEqual(current.data, next)) {
    console.log(`install-hook: already installed (no-op). settings=${settingsPath}`);
    console.log(`install-hook: hook script = ${hookScript}`);
    return;
  }

  const before = current.exists
    ? current.raw.endsWith('\n')
      ? current.raw
      : `${current.raw}\n`
    : '';
  const after = renderSettings(next);

  if (dryRun) {
    console.log(`install-hook: --dry-run (no files written)`);
    console.log(`install-hook: target = ${settingsPath}`);
    console.log(`install-hook: hook script = ${hookScript}`);
    console.log('---- diff ----');
    console.log(diffLines(before, after));
    console.log('--------------');
    return;
  }

  writeSettingsWithBackup(next);
  console.log(`install-hook: wrote ${settingsPath}`);
  if (current.exists) {
    console.log(`install-hook: backup at ${getSettingsBackupPath()}`);
  } else {
    console.log('install-hook: created new settings file (no prior backup needed)');
  }
  console.log(`install-hook: hook script = ${hookScript}`);
  console.log(
    'install-hook: ensure ~/.claude/livo-clouds-hud.env contains HUD_INGEST_TOKEN (see docs/v1/setup/setup-hook.md).',
  );
}

main();
