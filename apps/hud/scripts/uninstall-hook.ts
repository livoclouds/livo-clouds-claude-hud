#!/usr/bin/env node
import {
  deepEqual,
  diffLines,
  getHookScriptAbsPath,
  getSettingsBackupPath,
  getSettingsPath,
  readSettings,
  renderSettings,
  withHudHooksRemoved,
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
    console.error(`uninstall-hook: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  if (!current.exists) {
    console.log(`uninstall-hook: ${settingsPath} does not exist. Nothing to do.`);
    return;
  }

  const next = withHudHooksRemoved(current.data, hookScript);

  if (deepEqual(current.data, next)) {
    console.log(`uninstall-hook: HUD hook not present (no-op). settings=${settingsPath}`);
    return;
  }

  const before = current.raw.endsWith('\n') ? current.raw : `${current.raw}\n`;
  const after = renderSettings(next);

  if (dryRun) {
    console.log(`uninstall-hook: --dry-run (no files written)`);
    console.log(`uninstall-hook: target = ${settingsPath}`);
    console.log('---- diff ----');
    console.log(diffLines(before, after));
    console.log('--------------');
    return;
  }

  writeSettingsWithBackup(next);
  console.log(`uninstall-hook: wrote ${settingsPath}`);
  console.log(`uninstall-hook: backup at ${getSettingsBackupPath()}`);
}

main();
