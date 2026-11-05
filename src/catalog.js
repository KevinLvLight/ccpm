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
