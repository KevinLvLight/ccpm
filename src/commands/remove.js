import { MARKETPLACE, toId } from '../claude.js';
import { expandPreset } from '../presets.js';
import { resolveDeps } from '../plan.js';
import { saveState } from '../state.js';
import { execute, tryStep } from '../flow.js';
import { I, bold, dim, error } from '../ui.js';

// ccpm remove <插件或预设>...：点名的插件一定卸；预设里的插件，别的预设也包含或仍被依赖的保留
export async function run(ctx, args) {
  const { out, catalog, presets } = ctx;
  const names = [...new Set(args.map((a) => a.replace(`@${MARKETPLACE}`, '')))];
  if (!names.length) {
    out('用法：ccpm remove <插件或预设>...（详见 ccpm help remove）');
    return 1;
  }
  const isPreset = (n) => Object.hasOwn(presets, n);
  for (const n of names) {
    if (!isPreset(n) && !catalog.has(n) && !ctx.installed.some((p) => p.name === n && p.marketplace === MARKETPLACE)) {
      error(`没有叫 ${n} 的插件或预设`, '检查拼写；已装插件见 ccpm status，预设见 ccpm status').forEach(out);
      return 1;
    }
  }
  const presetArgs = names.filter(isPreset);
  const pluginArgs = names.filter((n) => !isPreset(n));
  if (presetArgs.length && ctx.scope === 'project') {
    error('预设只对全局生效，去掉 --scope project', `运行 ccpm remove --scope user ${presetArgs.join(' ')}`).forEach(out);
    return 1;
  }

  const mine = new Map(ctx.installed.filter((p) => p.marketplace === MARKETPLACE).map((p) => [p.name, p]));
  // 预设只对全局生效：--scope project 不碰 ccpm.json
  const state = ctx.scope !== 'project' && ctx.state ? { presets: [...ctx.state.presets], excluded: [...ctx.state.excluded] } : null;
  let touched = false;
  if (state) {
    const left = state.presets.filter((p) => !presetArgs.includes(p));
    touched = left.length !== state.presets.length;
    state.presets = left;
  }
  const owner = new Map(); // 插件 → 仍选着的、包含它的预设
  for (const p of state?.presets ?? []) {
    try { expandPreset(presets, p).forEach((n) => owner.has(n) || owner.set(n, p)); } catch {}
  }

  const notes = [];
  const keep = new Map(); // 预设带来的插件 → 保留原因
  const drop = new Set(pluginArgs.filter((n) => mine.has(n)));
  for (const n of pluginArgs.filter((x) => !mine.has(x))) notes.push(`  ${I.none} ${n}  ${dim('没有安装，无需卸载')}`);
  for (const ps of presetArgs) {
    for (const n of resolveDeps(expandPreset(presets, ps), catalog).order.filter((x) => mine.has(x) && !drop.has(x))) {
      if (owner.has(n)) keep.set(n, `预设 ${owner.get(n)} 也包含`);
      else drop.add(n);
    }
  }
  // 预设带来的插件若仍被留下的插件依赖，就保留；点名的照卸，只提示
  for (let changed = true; changed;) {
    changed = false;
    for (const p of mine.keys()) {
      if (drop.has(p)) continue;
      for (const d of catalog.get(p)?.dependencies ?? []) {
        if (drop.has(d) && !pluginArgs.includes(d)) { drop.delete(d); keep.set(d, `${p} 依赖它`); changed = true; }
      }
    }
  }
  for (const [n, why] of keep) notes.push(`  ${I.ok} ${n}  ${dim(`保留：${why}`)}`);
  const needed = new Set(); // 点名卸、但仍有插件依赖的：sync 会装回
  for (const d of pluginArgs.filter((x) => drop.has(x))) {
    const users = [...mine.keys()].filter((p) => !drop.has(p) && catalog.get(p)?.dependencies.includes(d));
    if (users.length) needed.add(d);
    if (users.length) notes.push(`  ${I.warn} ${users.join('、')} 依赖 ${d}，下次 ccpm sync 会重新安装 ${d}  ${dim(`都不要了就一起卸：ccpm remove ${d} ${users.join(' ')}`)}`);
  }
  // 点名卸的插件若还在选着的预设里，记住不再装回
  if (state) {
    for (const n of pluginArgs.filter((x) => owner.has(x) && !state.excluded.includes(x))) {
      state.excluded.push(n);
      touched = true;
    }
  }
  const save = () => { if (touched && !ctx.dryRun) saveState(state, ctx.stateFile); };
  // 说清楚对 ccpm.json 的影响，点名到具体的预设和插件
  const info = [
    ...presetArgs.filter((p) => ctx.state?.presets.includes(p)).map((p) => `卸载后 ${p} 不再算你选的预设，ccpm sync 不会再按它补装插件`),
    ...pluginArgs.filter((x) => owner.has(x) && !needed.has(x)).map((x) => `${x} 是预设 ${owner.get(x)} 里的插件，以后 ccpm sync 不会自动装回它；想要回来就运行 ccpm install ${x}`),
  ].map((l) => `  ${dim(l)}`);

  if (!drop.size) {
    out('');
    notes.forEach(out);
    info.forEach(out);
    save();
    out(`  ${I.ok} ${bold('没有需要卸载的插件')}`);
    return 0;
  }
  // 卸载顺序：先卸依赖方
  const order = resolveDeps([...drop], catalog).order.filter((n) => drop.has(n));
  const remove = [...order, ...[...drop].filter((n) => !order.includes(n))].reverse();
  const plan = { install: [], update: [], configure: [], warnings: [], duplicateMcp: [], orphans: [] };
  return execute(ctx, plan, {
    remove: remove.map((n) => ({ name: n, version: mine.get(n).version })),
    notes: [...notes, ...info],
    confirm: remove.length > 1 ? `确认卸载这 ${remove.length} 个插件？` : '确认卸载？',
    confirmDefault: false,
    okText: (k) => `${k} 个插件已卸载`,
    act: async (report) => {
      for (const n of remove) {
        await tryStep(report, n, () => ctx.progress.step(`正在卸载 ${n}`, () => ctx.claude.uninstall(toId(n), { scope: ctx.scope }), {
          done: `已卸载 ${n}`, fail: `卸载失败 ${n}`,
        }));
      }
      save();
    },
  });
}
