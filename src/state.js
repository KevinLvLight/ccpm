import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function statePath() {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'ccpm.json');
}

const isStrings = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');

export function loadState(file = statePath(), { readOnly = false } = {}) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (data && typeof data === 'object' && isStrings(data.presets) && isStrings(data.excluded)) {
    return { presets: data.presets, excluded: data.excluded };
  }
  if (!readOnly) renameSync(file, file + '.bak');
  return null;
}

export function saveState(state, file = statePath()) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, file);
}
