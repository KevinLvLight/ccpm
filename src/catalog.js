import { t } from './i18n/index.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const USER_KEYS = ['title', 'description', 'type', 'sensitive', 'required', 'default'];
const TYPES = ['string', 'directory'];

// warn：维护者关心的问题（ccpm 运行时只写诊断日志，check 脚本打印到 stderr）
export function loadCatalog(marketplaceDir, warn = console.warn) {
  const { plugins = [] } = readJson(join(marketplaceDir, '.claude-plugin/marketplace.json'));
  const catalog = new Map();
  for (const entry of plugins) {
    const dir = join(marketplaceDir, entry.source);
    let raw;
    try {
      raw = readJson(join(dir, '.claude-plugin/plugin.json'));
    } catch {
      warn(t('跳过插件 {0}：缺少或无法解析 plugin.json', entry.name));
      continue;
    }
    let mcpServers = [];
    try {
      mcpServers = Object.keys(readJson(join(dir, '.mcp.json')).mcpServers ?? {});
    } catch {}
    const name = entry.name;
    if (raw.name && raw.name !== name) warn(t('插件 {0}：plugin.json 的 name 为 {1}，以 marketplace 条目名为准', name, raw.name));
    catalog.set(name, {
      name,
      version: raw.version,
      description: raw.description,
      dependencies: (raw.dependencies ?? []).filter((d) => typeof d === 'string').map((d) => d.split('@')[0]),
      userConfig: raw.userConfig ?? {},
      mcpServers,
      dir,
      raw,
    });
  }
  return catalog;
}

export function checkManifest(raw) {
  const out = [];
  const deps = raw.dependencies;
  if (deps !== undefined) {
    if (!Array.isArray(deps)) out.push(t('dependencies 不是数组'));
    else deps.forEach((d, i) => typeof d !== 'string' && out.push(t('dependencies 第 {0} 项不是字符串', i + 1)));
  }
  for (const [key, def] of Object.entries(raw.userConfig ?? {})) {
    for (const k of Object.keys(def)) if (!USER_KEYS.includes(k)) out.push(t('userConfig.{0} 含未知属性 {1}', key, k));
    if (def.type !== undefined && !TYPES.includes(def.type)) out.push(t('userConfig.{0} 的 type 为 {1}，ccpm 不支持', key, def.type));
  }
  return out;
}

export function readChangelogEntry(meta, version) {
  let text;
  try {
    text = readFileSync(join(meta.dir, 'CHANGELOG.md'), 'utf8');
  } catch {
    return null;
  }
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^## \\[?${esc}\\]?(?:[ \\t].*)?$\\n?([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  return m ? m[1].trim() : null;
}

// from（不含）到 to（含）之间的更新说明，新的在前；from 为空时只取 to 这一版。
// 也认按大版本分组的写法（“## [2.6]”：更新跨进了这一组才算）；都对不上时退回“Unreleased”一节
export function changelogBetween(meta, from, to) {
  let text;
  try { text = readFileSync(join(meta.dir, 'CHANGELOG.md'), 'utf8'); } catch { return []; }
  const parts = (v) => String(v).replace(/^v/i, '').split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const cmp = (a, b) => {
    const pa = parts(a), pb = parts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] ?? 0, y = pb[i] ?? 0;
      if (x !== y) return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    }
    return 0;
  };
  const head = (v, n) => parts(v).slice(0, n).join('.'); // 2.6.115 的前两段 → 2.6
  const out = [];
  let unreleased = null;
  for (const m of text.matchAll(/^## \[?([^\]\s]+)\]?(?:[ \t].*)?$\n?([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    const v = m[1].replace(/^v/i, '');
    const body = m[2].trim();
    if (/^unreleased$/i.test(v)) { unreleased = body; continue; }
    if (!/^\d+(\.\d+)*$/.test(v)) continue;
    const n = v.split('.').length;
    const take = n >= 3
      ? (from ? cmp(v, from) > 0 : cmp(v, to) === 0) && cmp(v, to) <= 0
      : (from ? cmp(v, head(from, n)) > 0 : v === head(to, n)) && cmp(v, head(to, n)) <= 0; // 分组：2.6 覆盖 2.6.x
    if (take) out.push({ version: n >= 3 ? v : `${v}.x`, text: body });
  }
  if (!out.length && unreleased && from) return [{ version: 'Unreleased', unreleased: true, text: unreleased }];
  return out.sort((a, b) => cmp(b.version.replace('.x', '.9999999'), a.version.replace('.x', '.9999999')));
}
