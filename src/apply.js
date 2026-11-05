import { t } from './i18n/index.js';
import { ClaudeError, MARKETPLACE, toId } from './claude.js';
import { readChangelogEntry } from './catalog.js';
import { warn } from './render.js';
import { I, bold, dim, fixLine } from './ui.js';

export const requiredKeys = (meta) =>
  Object.entries(meta.userConfig ?? {}).filter(([, d]) => d.required === true).map(([k]) => k);

export const isInteractive = (ctx) => !ctx.yes && ctx.prompter.interactive !== false;

const MAX_LOG = 8;
const missing = (key) => Object.assign(new Error('NON_INTERACTIVE'), { key });

// editing：ccpm config 修改已有配置，留空 = 保留原值（不收录）
export async function collectConfig(ctx, meta, keys, { editing = false } = {}) {
  const { prompter, out } = ctx;
  const values = {};
  if (!keys.length) return values;
  if (isInteractive(ctx)) {
    out('');
    out(`  ${bold(meta.name)} ${dim(t('需要 {0} 项配置 · {1}', keys.length, editing ? t('直接回车 = 保留原值') : t('以后可用 ccpm config {0} 修改', meta.name)))}`);
  }
  for (const key of keys) {
    const def = meta.userConfig?.[key] ?? {};
    const opts = {
      secret: def.sensitive === true,
      default: editing ? undefined : def.default,
      hint: def.description ?? (def.type === 'directory' ? t('填一个目录的完整路径') : undefined),
    };
    const ask = async () => String(await prompter.ask(def.title ?? key, opts)).trim(); // 粘贴常带空格/换行
    let v;
    try {
      v = await ask();
      if (v === '' && def.required === true && !editing) {
        out(t('  {0} 此项必填', I.warn));
        v = await ask();
      }
    } catch (e) {
      if (e.message === 'NON_INTERACTIVE') throw missing(key);
      throw e;
    }
    if (v === '' && def.required === true && !editing) throw missing(key);
    if (v !== '') values[key] = v;
  }
  if (isInteractive(ctx)) out('');
  return values;
}

// 已装但停用的插件，配置好后问一句要不要启用（--yes / 非交互只提示）
async function offerEnable(ctx, name) {
  const p = (ctx.installed ?? []).find((x) => x.name === name && x.marketplace === MARKETPLACE);
  if (p?.enabled !== false) return;
  const id = toId(name);
  if (isInteractive(ctx) && (await ctx.prompter.confirm(t('{0} 目前是停用状态，现在启用吗？', name), { default: true }))) {
    await ctx.progress.step(t('正在启用 {0}', name), () => ctx.claude.enable(id, { scope: ctx.scope }), { done: t('已启用 {0}', name), fail: t('启用失败 {0}', name) });
    p.enabled = true;
  } else {
    ctx.out(t('  {0} {1} 目前是停用状态', I.off, name));
    ctx.out(fixLine(t('运行 ccpm enable {0}', name)));
  }
}

// 配置值只走 stdin（configure），绝不进命令行参数。返回是否写入了配置。
export async function configureKeys(ctx, meta, keys, { tag = '', editing = false } = {}) {
  const values = await collectConfig(ctx, meta, keys, { editing });
  if (!Object.keys(values).length) return false;
  await ctx.progress.step(t('{0}正在保存 {1} 的配置', tag, meta.name), () => ctx.claude.configure(toId(meta.name), values), {
    done: t('已保存 {0} 的配置', meta.name), fail: t('保存配置失败 {0}', meta.name),
  });
  await offerEnable(ctx, meta.name);
  return true;
}

async function installOne(ctx, name, tag = '') {
  const meta = ctx.catalog.get(name);
  const id = toId(name);
  const values = await collectConfig(ctx, meta, requiredKeys(meta));
  const written = Object.keys(values).length > 0;
  await ctx.progress.step(t('{0}正在安装 {1}', tag, name), async () => {
    await ctx.claude.install(id, { scope: ctx.scope });
    if (written) await ctx.claude.configure(id, values);
    if (meta.raw?.defaultEnabled === false) await ctx.claude.enable(id, { scope: ctx.scope });
  }, { done: t('已安装 {0}', name), fail: t('安装失败 {0}', name), detail: [written && t('已写入配置'), t('已启用')].filter(Boolean).join(' · ') });
}

export async function postUpdate(ctx, name, from, to) {
  const meta = ctx.catalog.get(name);
  const lines = [];
  const entry = readChangelogEntry(meta, to);
  if (entry) {
    const log = entry.split('\n');
    lines.push(...log.slice(0, MAX_LOG).map((l) => (l.trim() ? `    ${dim(l)}` : '')));
    if (log.length > MAX_LOG) lines.push(`    ${dim(t('… 完整更新记录见插件 CHANGELOG'))}`);
  }

  const req = new Set(requiredKeys(meta));
  const keys = (await ctx.claude.getUnconfigured(toId(name))).filter((k) => req.has(k));
  if (keys.length) {
    try {
      await configureKeys(ctx, meta, keys);
    } catch (e) {
      if (e.message !== 'NON_INTERACTIVE') throw e;
      lines.push(...warn(t('{0} 还缺必填配置 {1}', name, e.key), t('运行 ccpm config {0}', name)));
    }
  }

  const have = new Set((ctx.installed ?? []).map((p) => p.name));
  for (const d of meta.dependencies) {
    if (have.has(d) || !ctx.catalog.has(d)) continue;
    try {
      await installOne(ctx, d);
      have.add(d);
      lines.push(`    ${dim(t('{0} 新增了依赖 {1}，已一并安装', name, d))}`);
    } catch (e) {
      if (e.message !== 'NON_INTERACTIVE') throw e;
      lines.push(...warn(t('{0} 新增的依赖 {1} 缺必填配置 {2}，没装上', name, d, e.key), t('运行 ccpm install {0}', d)));
    }
  }

  // ctx.previous: 更新前的 catalog（可选），用于发现被去掉的依赖
  for (const d of ctx.previous?.get(name)?.dependencies ?? []) {
    if (!meta.dependencies.includes(d)) lines.push(`    ${dim(t('{0} 不再需要 {1} · 运行 ccpm sync 可清理', name, d))}`);
  }
  return lines;
}

export async function applyPlan(ctx, plan) {
  const report = { ok: [], skipped: [], failed: [] };
  const bad = new Set();
  const total = plan.install.length + plan.update.length + plan.configure.length;
  let n = 0;
  const skip = (name, reason) => {
    report.skipped.push({ name, reason });
    bad.add(name);
    ctx.out(t('{0} 跳过 {1}  {2}', I.warn, name, dim(reason)));
  };
  // fix：缺配置时提示用户运行的命令
  const step = async (name, fix, fn) => {
    const tag = `[${++n}/${total}] `;
    try {
      await fn(tag);
      if (!report.ok.includes(name)) report.ok.push(name);
    } catch (e) {
      if (e.message === 'NON_INTERACTIVE') return skip(name, t('缺必填配置 {0} → {1}', e.key, fix));
      if (!(e instanceof ClaudeError)) throw e;
      report.failed.push({ name, error: e.brief });
      bad.add(name);
    }
  };
  // 传递依赖里有跳过/失败项 → 不能调用 install（Claude Code 会把依赖连带装成未配置状态）
  const badDep = (name, seen = new Set()) => {
    for (const d of ctx.catalog.get(name)?.dependencies ?? []) {
      if (seen.has(d)) continue;
      seen.add(d);
      if (bad.has(d)) return d;
      const r = badDep(d, seen);
      if (r) return r;
    }
  };
  for (const name of plan.install) {
    const d = badDep(name);
    if (d) {
      n++;
      skip(name, t('依赖 {0} 没装上', d));
    }
    else await step(name, `ccpm install ${name}`, (tag) => installOne(ctx, name, tag));
  }
  for (const { name, from, to } of plan.update) {
    await step(name, `ccpm config ${name}`, async (tag) => {
      await ctx.progress.step(t('{0}正在更新 {1}', tag, name), () => ctx.claude.update(toId(name), { scope: ctx.scope }), {
        done: t('已更新 {0}', name), fail: t('更新失败 {0}', name), detail: `${from} → ${to}`,
      });
      for (const l of await postUpdate(ctx, name, from, to)) ctx.out(l);
    });
  }
  for (const { name, keys } of plan.configure) {
    await step(name, `ccpm config ${name}`, (tag) => configureKeys(ctx, ctx.catalog.get(name), keys, { tag }));
  }
  return report;
}
