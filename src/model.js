import { t } from './i18n/index.js';
import { MARKETPLACE } from './claude.js';
import { USER_MCP, computePlan } from './plan.js';
import { expandPreset } from './presets.js';

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 计划里的问题（纯数据）。name：属于某个已装插件（已在插件行上标出）；cmd/why：用于“下一步”
// line=true 的问题占一整行（strong：标题加粗；faint：说明变灰）
export function planIssues(plan) {
  const out = [];
  for (const o of plan.orphans) out.push({ name: o, title: o, detail: t('marketplace 里已下架'), cmd: `ccpm remove ${o}`, why: t('卸载已下架的 {0}', o) });
  for (const { server, owners } of plan.duplicateMcp) {
    const plugins = owners.filter((o) => o !== USER_MCP);
    const who = owners.map((o) => (o === USER_MCP ? t('你自己配置的') : t('插件 {0}', o))).join(t('、'));
    const mine = owners.includes(USER_MCP);
    out.push({
      title: `MCP ${server}`,
      detail: t('配了两份：{0}', who),
      cmd: mine ? `claude mcp remove ${server} -s user` : `ccpm remove ${plugins.at(-1)}`,
      why: mine ? t('去掉你自己配置的那份（或 ccpm remove {0}）', plugins.join(' ')) : t('去掉重复的 MCP {0}', server),
    });
  }
  for (const w of plan.warnings) out.push({ title: w.msg, detail: w.fix, line: true, faint: true });
  return out;
}

// status / list / 交互界面共用的数据：只有纯数据，不含颜色和排版。
// plan 缺省时不查配置（list 用）：只算可更新、已停用、已下架。
export function buildModel(ctx, plan) {
  const { catalog } = ctx;
  const presets = ctx.presets ?? {};
  const user = ctx.scope !== 'project';
  plan ??= computePlan({ installed: ctx.installed, catalog, state: null, presets: {}, unconfigured: new Map(), userMcp: [] });
  const mine = new Map(ctx.installed.filter((p) => p.marketplace === MARKETPLACE).map((p) => [p.name, p]));
  const upd = new Map(plan.update.map((u) => [u.name, { from: u.from, to: u.to }]));
  const titles = (name, keys) => keys.map((k) => catalog.get(name)?.userConfig?.[k]?.title ?? k);
  const cfg = new Map(plan.configure.map((c) => [c.name, titles(c.name, c.keys)]));

  const plugins = [...new Set([...catalog.keys(), ...mine.keys()])].sort(byName).map((name) => {
    const m = catalog.get(name);
    const p = mine.get(name);
    const where = p ? 'here' : ctx.globalNames?.has(name) ? 'global' : 'none';
    return {
      name,
      description: m?.description ?? '',
      version: p ? p.version : where === 'global' ? ctx.globalNames.get(name) : undefined,
      latest: m?.version,
      where,
      enabled: p ? p.enabled !== false : undefined,
      update: upd.get(name) ?? null,
      missingConfig: cfg.get(name) ?? [],
      missingDeps: p ? (m?.dependencies ?? []).filter((d) => !mine.has(d)) : [],
      delisted: !m,
      dependencies: m?.dependencies ?? [],
      hasConfig: Object.keys(m?.userConfig ?? {}).length > 0,
    };
  });
  const count = (where) => plugins.filter((p) => p.where === where).length;
  const counters = {
    installed: count('here'), global: count('global'), notInstalled: count('none'),
    update: plan.update.length, configure: plan.configure.length, disabled: plan.disabled?.length ?? 0,
    presets: user ? Object.keys(presets).length : 0,
    presetsChosen: user ? (ctx.state?.presets ?? []).filter((p) => Object.hasOwn(presets, p)).length : 0,
  };

  // 下一步：命令 → 原因（去重，按首次出现排序）
  const todo = new Map();
  const next = (cmd, why) => todo.set(cmd, new Set([...(todo.get(cmd) ?? []), why]));
  if (plan.update.length) {
    const names = plan.update.map((u) => u.name);
    next('ccpm update', names.length > 2 ? t('更新 {0} 个插件', names.length) : t('更新 {0}', names.join(t('、'))));
  }
  for (const n of plan.disabled ?? []) next(`ccpm enable ${n}`, t('重新启用（有意停用的可忽略）'));
  for (const c of plan.configure) next(`ccpm config ${c.name}`, t('填写 {0} 项配置', c.keys.length));
  const depsMissing = new Set(plugins.flatMap((p) => p.missingDeps));
  if (depsMissing.size) next('ccpm sync', t('补装缺少的依赖'));

  // 不属于某个已装插件的问题
  const issues = [];
  if (user && ctx.state) {
    const chosen = ctx.state.presets.flatMap((ps) => { try { return expandPreset(presets, ps); } catch { return []; } });
    for (const n of plan.install.filter((x) => !depsMissing.has(x))) {
      if (!chosen.includes(n)) issues.push({ title: n, detail: t('预设插件的依赖，还没装') }); // 预设里的缺口在“预设”一节里标出
      next('ccpm sync', t('补装预设里的插件'));
    }
  } else if (user && Object.keys(presets).length) { // 没有预设的 marketplace 不需要“开始管理”
    issues.push({ title: t('还没开始用 ccpm 管理'), detail: t('推荐预设：{0}', plan.inferredPresets?.join(t('、')) || t('暂无（可选的预设见上方）')), line: true, strong: true });
    next('ccpm sync', t('开始用 ccpm 管理'));
  }
  for (const it of planIssues(plan)) {
    if (!it.name) issues.push(it);
    if (it.cmd) next(it.cmd, it.why);
  }
  if (ctx.refreshError) issues.push({ title: t('插件列表更新失败'), detail: t('结果来自上次的本地副本 · 检查网络 / VPN 后重试'), line: true, strong: true, faint: true });
  // sync 已包含更新，避免同时让用户跑两条
  if (todo.has('ccpm sync') && todo.has('ccpm update')) {
    todo.get('ccpm update').forEach((w) => todo.get('ccpm sync').add(w));
    todo.delete('ccpm update');
  }

  return {
    scope: ctx.scope,
    counters,
    presets: user ? presetModel(ctx, presets, new Set(mine.keys())) : [],
    plugins,
    issues,
    next: [...todo].map(([cmd, why]) => ({ cmd, why: [...why].join(t('、')) })),
  };
}

// 每个预设：选没选（via：被哪个已选预设包含）、装齐没有、直接成员
function presetModel(ctx, presets, have) {
  const chosen = new Set(ctx.state?.presets ?? []);
  const via = new Map();
  const walk = (p, top) => (presets[p]?.plugins ?? []).forEach((x) => {
    if (Object.hasOwn(presets, x) && !via.has(x) && !chosen.has(x)) { via.set(x, top); walk(x, top); }
  });
  chosen.forEach((p) => walk(p, p));
  const excluded = new Set(ctx.state?.excluded ?? []);
  const out = [];
  for (const name of Object.keys(presets)) {
    let all;
    try { all = expandPreset(presets, name); } catch { continue; }
    const want = all.filter((n) => ctx.catalog.has(n) && !excluded.has(n));
    out.push({
      name,
      description: presets[name].description ?? '',
      chosen: chosen.has(name),
      via: via.get(name) ?? null,
      want: want.length,
      got: want.filter((n) => have.has(n)).length,
      members: presets[name].plugins.map((n) => {
        const preset = Object.hasOwn(presets, n);
        return { name: n, kind: preset ? 'preset' : 'plugin', installed: have.has(n), excluded: excluded.has(n), delisted: !preset && !ctx.catalog.has(n) };
      }),
    });
  }
  return out;
}
