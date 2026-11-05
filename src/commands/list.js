import { t } from '../i18n/index.js';
import { MARKETPLACE } from '../claude.js';
import { scoped } from '../context.js';
import { buildModel } from '../model.js';
import { I, brief, dim, hints, table, yellow } from '../ui.js';

// 列出当前 marketplace 里的全部插件：已装（含可更新/已停用）在前，未装在后（整行灰色）
export async function run(ctx) {
  const { out } = ctx;
  const all = buildModel(ctx).plugins.filter((p) => !p.delisted);
  const of = (where) => all.filter((p) => p.where === where);
  const [have, glob, not] = [of('here'), of('global'), of('none')];
  const where = ctx.scope === 'project' ? t('当前项目') : t('全局');

  const rows = [[dim(t('   插件')), dim(t('版本')), dim(t('说明'))]];
  for (const p of have) {
    const sym = p.update ? I.up : p.enabled === false ? I.off : I.ok;
    rows.push([`${sym}  ${p.name}`, p.update ? `${p.update.from} → ${p.update.to}` : p.version, `${brief(p.description)}${p.enabled === false ? `  ${yellow(t('已停用'))}` : ''}`]);
  }
  for (const p of glob) rows.push([dim(`✔  ${p.name}`), dim(p.latest ?? ''), dim(t('{0}  装在全局', brief(p.description)))]);
  for (const p of not) rows.push([dim(`○  ${p.name}`), dim(p.latest ?? ''), dim(brief(p.description))]);

  out('');
  out(t('{0} · {1} 个插件 · {2}已装 {3}{4} · 未装 {5}', MARKETPLACE, all.length, where, have.length, glob.length ? t(' · 全局已装 {0}', glob.length) : '', not.length));
  out('');
  table(rows, { gap: '   ' }).forEach(out);

  const tips = [];
  if (not.length) tips.push([scoped(ctx, t('ccpm install <插件名>')), t('安装，依赖会一起装')]);
  if (have.some((p) => p.update)) tips.push([scoped(ctx, 'ccpm update'), t('更新到最新版')]);
  if (tips.length) {
    out('');
    hints(tips).forEach(out);
  }
  return 0;
}
