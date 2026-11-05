import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { MARKETPLACE } from './claude.js';

// ccpm.json：{ current, marketplaces: { <名字>: { presets, excluded } } }，每个 marketplace 各存一份
export function statePath() {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'ccpm.json');
}

const isStrings = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
const empty = () => ({ current: null, marketplaces: {} });
const valid = (d) => d && typeof d === 'object' && !Array.isArray(d)
  && (d.current === null || d.current === undefined || typeof d.current === 'string')
  && d.marketplaces && typeof d.marketplaces === 'object'
  && Object.values(d.marketplaces).every((m) => m && isStrings(m.presets) && isStrings(m.excluded));

// 文件不存在 → 空；格式不对（包括旧版只有 presets/excluded 的格式）→ 备份为 .bak 后当作空
export function loadFile(file = statePath(), { readOnly = false } = {}) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return empty();
    throw e;
  }
  let data = null;
  try { data = JSON.parse(raw); } catch {}
  if (valid(data)) return { current: data.current ?? null, marketplaces: data.marketplaces };
  if (!readOnly) renameSync(file, file + '.bak');
  return empty();
}

export function saveFile(data, file = statePath()) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, file);
}

// 当前 marketplace 的 { presets, excluded }；没有记录时为 null
export function loadState(file = statePath(), { readOnly = false, marketplace = MARKETPLACE } = {}) {
  const m = loadFile(file, { readOnly }).marketplaces[marketplace];
  return m ? { presets: m.presets, excluded: m.excluded } : null;
}

export function saveState(state, file = statePath(), marketplace = MARKETPLACE) {
  const data = loadFile(file);
  data.marketplaces[marketplace] = { presets: state.presets, excluded: state.excluded };
  saveFile(data, file);
}

export function setCurrent(name, file = statePath()) {
  const data = loadFile(file);
  data.current = name;
  saveFile(data, file);
}
