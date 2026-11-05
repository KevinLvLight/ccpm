import { expandPreset } from './presets.js';

const MKT = 'ai-efficiency';
export const USER_MCP = '你自己配置的 MCP';

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function resolveDeps(names, catalog) {
  const order = [];
  const unknown = [];
  const seen = new Set();
  const visit = (n) => {
    if (seen.has(n)) return;
    seen.add(n);
    const m = catalog.get(n);
    if (!m) return void unknown.push(n);
    for (const d of m.dependencies) visit(d);
    order.push(n);
  };
  names.forEach(visit);
  return { order, unknown };
}

export function inferPresets(presets, installedNames) {
  return Object.keys(presets).filter((p) => {
    try {
      return expandPreset(presets, p).every((n) => installedNames.has(n));
    } catch {
      return false;
    }
  });
}

export const unknownPlugin = (n) => ({ msg: `插件 ${n} 已从 marketplace 下架，已跳过`, fix: '无需处理，其余插件照常安装' });

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function computePlan({ installed, catalog, state, presets, unconfigured, userMcp }) {
  const mine = installed.filter((p) => p.marketplace === MKT);
  const have = new Set(mine.map((p) => p.name));
  const warnings = [];
  const desired = new Set();
  for (const name of state?.presets ?? []) {
    try {
      expandPreset(presets, name).forEach((n) => desired.add(n));
    } catch (e) {
      warnings.push(Object.hasOwn(presets, name)
        ? { msg: e.message, fix: '联系 ai-efficiency 维护者修复 presets.json' }
        : { msg: `预设 ${name} 已不存在，已跳过`, fix: `从 ~/.claude/ccpm.json 的 presets 里删掉 ${name}` });
    }
  }
  for (const n of state?.excluded ?? []) desired.delete(n);
  for (const p of mine) for (const d of catalog.get(p.name)?.dependencies ?? []) desired.add(d);

  const { order, unknown } = resolveDeps([...desired], catalog);
  for (const n of unknown) warnings.push(unknownPlugin(n));

  const update = mine
    .filter((p) => catalog.has(p.name) && compareVersions(p.version, catalog.get(p.name).version) < 0)
    .map((p) => ({ name: p.name, from: p.version, to: catalog.get(p.name).version }))
    .sort((a, b) => byName(a.name, b.name));

  const configure = [];
  for (const [name, keys] of unconfigured) {
    const uc = catalog.get(name)?.userConfig ?? {};
    const req = keys.filter((k) => uc[k]?.required === true);
    if (req.length) configure.push({ name, keys: req });
  }
  configure.sort((a, b) => byName(a.name, b.name));

  const owners = new Map();
  const add = (s, o) => owners.set(s, [...(owners.get(s) ?? []), o]);
  for (const p of [...mine].sort((a, b) => byName(a.name, b.name))) {
    for (const s of catalog.get(p.name)?.mcpServers ?? []) add(s, p.name);
  }
  for (const s of userMcp) add(s, USER_MCP);
  const duplicateMcp = [...owners]
    .filter(([, o]) => o.length >= 2)
    .map(([server, o]) => ({ server, owners: o }))
    .sort((a, b) => byName(a.server, b.server));

  return {
    install: order.filter((n) => !have.has(n)),
    update,
    configure,
    duplicateMcp,
    orphans: mine.filter((p) => !catalog.has(p.name)).map((p) => p.name).sort(byName),
    disabled: mine.filter((p) => p.enabled === false).map((p) => p.name).sort(byName),
    warnings,
  };
}
