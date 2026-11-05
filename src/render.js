import { I, bold, brief, dim, fixLine, table, yellow } from './ui.js';

export { fixLine };
// ▲ 一行问题，后面紧跟一行“怎么办”
export const warn = (msg, fix) => [`${yellow('▲')} ${msg}`, fixLine(fix)];

// 问题行（见 model.js 的 planIssues / buildModel().issues）
export const issueCells = (it) => (it.line
  ? [`${I.warn} ${it.strong ? bold(it.title) : it.title}  ${it.faint ? dim(it.detail) : it.detail}`]
  : [`${I.warn} ${bold(it.title)}`, it.detail]);

// 已装插件：有问题 ▲，否则可更新 ↑ / 已停用 ⏸ / 正常 ✔
export const pluginSym = (p) => (p.missingConfig.length || p.missingDeps.length || p.delisted ? I.warn
  : p.update ? I.up : p.enabled === false ? I.off : I.ok);
export const pluginNotes = (p) => [
  p.update && '可更新',
  p.enabled === false && '已停用',
  p.missingConfig.length && `缺少配置：${p.missingConfig.join('、')}`,
  p.missingDeps.length && `缺少依赖 ${p.missingDeps.join('、')}`,
  p.delisted && 'marketplace 里已下架',
].filter(Boolean);
// 已装插件一行：符号 名称 / 版本 / 状态说明
export function pluginCells(p) {
  const sym = pluginSym(p);
  return [
    `${sym} ${sym !== I.ok ? bold(p.name) : p.name}`,
    dim(p.update ? `${p.update.from} → ${p.update.to}` : p.version ?? ''),
    pluginNotes(p).map((n) => (n === '已停用' ? yellow(n) : n)).join(' · '),
  ];
}

// 预设一行：符号 名称 / 选没选、装齐没有 / 说明
export function presetCells(p) {
  const on = p.chosen || p.via;
  const short = p.got < p.want;
  const how = p.chosen ? '已选' : `已选（${p.via} 包含）`;
  const state = on ? (short ? `${how} · ${yellow(`缺 ${p.want - p.got} 个`)}` : `${how} · 已装齐`) : dim(`未选 · 已装 ${p.got}/${p.want}`);
  return [`${on ? (short ? I.warn : I.ok) : I.none} ${on ? bold(p.name) : p.name}`, state, dim(p.description)];
}
// 预设成员：✔ 已装 / ○ 未装 / − 你卸掉的 / 含子预设
export const memberText = (x) => (x.kind === 'preset' ? dim(`含 ${x.name} 全部`)
  : x.delisted ? `${I.warn} ${x.name}${dim('（已下架）')}`
    : x.installed ? `${I.ok} ${x.name}`
      : x.excluded ? dim(`− ${x.name}（你卸掉的）`) : `${I.none} ${dim(x.name)}`);

// ● 2 已装   ↑ 1 可更新 …
export function counterCells({ scope, counters: c }) {
  const out = [`${I.dot} ${c.installed} ${scope === 'project' ? '本项目已装' : '已装'}`];
  if (c.global) out.push(`${I.dot} ${c.global} 全局已装`);
  if (c.update) out.push(`${I.up} ${c.update} 可更新`);
  if (c.configure) out.push(`${I.warn} ${c.configure} 需配置`);
  if (c.disabled) out.push(`${I.off} ${c.disabled} 已停用`);
  if (c.notInstalled) out.push(`${I.none} ${dim(`${c.notInstalled} 未装`)}`);
  return out;
}

// sync/install 等的“将要执行”行；remove：[{ name, version, note }]
export function planRows(plan, catalog, remove = []) {
  const rows = [];
  for (const n of plan.install) {
    const m = catalog?.get(n);
    rows.push([`${I.add} ${n}`, m?.version ?? '', dim(brief(m?.description))]);
  }
  for (const u of plan.update) rows.push([`${I.up} ${u.name}`, `${u.from} → ${u.to}`]);
  for (const r of remove) rows.push([`${I.del} ${r.name}`, r.version ?? '', dim(r.note ?? '')]);
  for (const c of plan.configure) {
    const titles = c.keys.map((k) => catalog?.get(c.name)?.userConfig?.[k]?.title ?? k);
    rows.push([`${I.warn} ${c.name}`, `需要填写：${titles.join('、')}`]);
  }
  return table(rows);
}
