import { scoped } from '../context.js';
import { buildModel } from '../model.js';
import { I, brief, dim, hints, table, yellow } from '../ui.js';

// 列出 acme-plugins 里的全部插件：已装（含可更新/已停用）在前，未装在后（整行灰色）
export async function run(ctx) {
  const { out } = ctx;
  const all = buildModel(ctx).plugins.filter((p) => !p.delisted);
  const of = (where) => all.filter((p) => p.where === where);
  const [have, glob, not] = [of('here'), of('global'), of('none')];
  const where = ctx.scope === 'project' ? '当前项目' : '全局';

  const rows = [[dim('   插件'), dim('版本'), dim('说明')]];
  for (const p of have) {
    const sym = p.update ? I.up : p.enabled === false ? I.off : I.ok;
    rows.push([`${sym}  ${p.name}`, p.update ? `${p.update.from} → ${p.update.to}` : p.version, `${brief(p.description)}${p.enabled === false ? `  ${yellow('已停用')}` : ''}`]);
  }
  for (const p of glob) rows.push([dim(`✔  ${p.name}`), dim(p.latest ?? ''), dim(`${brief(p.description)}  装在全局`)]);
  for (const p of not) rows.push([dim(`○  ${p.name}`), dim(p.latest ?? ''), dim(brief(p.description))]);

  out('');
  out(`acme-plugins · ${all.length} 个插件 · ${where}已装 ${have.length}${glob.length ? ` · 全局已装 ${glob.length}` : ''} · 未装 ${not.length}`);
  out('');
  table(rows, { gap: '   ' }).forEach(out);

  const tips = [];
  if (not.length) tips.push([scoped(ctx, 'ccpm install <插件名>'), '安装，依赖会一起装']);
  if (have.some((p) => p.update)) tips.push([scoped(ctx, 'ccpm update'), '更新到最新版']);
  if (tips.length) {
    out('');
    hints(tips).forEach(out);
  }
  return 0;
}
