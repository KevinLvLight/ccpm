import { t } from './i18n/index.js';
import { join, resolve } from 'node:path';
import { MARKETPLACE, createClaude, setMarketplace, toId } from './claude.js';
import { resolveMarketplace } from './marketplace.js';
import { loadCatalog } from './catalog.js';
import { loadPresets } from './presets.js';
import { loadFile, loadState } from './state.js';
import { computePlan, inferPresets } from './plan.js';
import { createPrompter } from './prompt.js';
import { createProgress } from './progress.js';
import { requiredKeys } from './apply.js';
import { dim, error, fixLine } from './ui.js';
import { warn } from './render.js';

export class PreconditionError extends Error {
  constructor(message, fix) {
    super(fix ? `${message}\n${fixLine(fix)}` : message);
    this.name = 'PreconditionError';
  }
}

export const GIT_AUTH = /unable to get password|could not read Username|Authentication failed/;
export const GIT_HINT = () => t('先为 marketplace 所在的 git 服务器配置凭证（credential helper，或手动 git clone 一次该仓库），再重试');
export const NET_HINT = () => t('检查网络 / VPN 能否访问 marketplace 所在的 git 服务器后重试');

export const samePath = (a, b, platform = process.platform) =>
  platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

export async function loadContext(opts, deps = {}) {
  const { scope = 'user', yes = false, dryRun = false, readOnly = false } = opts;
  const rawOut = deps.out ?? ((l) => console.log(l));
  const ctx = { scope }; // 交互界面会切换 ctx.scope，输出按当前范围处理
  // 项目范围下，提示里建议的 ccpm 命令都要带上 --scope project，否则照做会作用到全局
  let blank = false; // 不连续输出两行空行
  const print = (l) => {
    if (l === '' && blank) return;
    blank = l === '';
    rawOut(ctx.scope === 'project' ? withScope(l) : l);
  };
  const log = deps.log ?? (() => {});
  const claude = deps.claude ?? createClaude({ log });
  const progress = deps.progress ?? createProgress({ out: print, animate: Boolean(process.stdout.isTTY) && !yes, prep: true });
  // 第一行正式输出 / 第一个提问前，准备阶段的转圈收成一行“准备就绪”
  const out = (l) => { progress.ready?.(); print(l); };
  const prompter = deps.prompter ?? createPrompter({
    input: process.stdin, output: process.stdout, interactive: Boolean(process.stdin.isTTY) && !yes,
    onPrompt: () => { progress.ready?.(); progress.pause(); blank = false; }, log,
  });

  // 已装列表与刷新无关，最先发出，和后面的步骤重叠
  const listingP = Promise.resolve().then(() => claude.listInstalled());
  listingP.catch(() => {});

  // 能力检测与 marketplace 列表并发
  const mkts = await progress.step(t('检查 Claude Code'), async () => {
    const [cap, list] = await Promise.all([claude.checkCapabilities(), Promise.resolve().then(() => claude.listMarketplaces()).catch((e) => e)]);
    if (!cap.ok) {
      throw cap.missing.includes('claude')
        ? new PreconditionError(t('未找到 claude 命令'), t('安装 Claude Code 后，重新打开命令行窗口再试'))
        : new PreconditionError(t('Claude Code 版本太旧，请升级 Claude Code'), t('运行 claude update'));
    }
    if (list instanceof Error) throw list;
    return list;
  });

  const { name, note } = resolveMarketplace({ flag: opts.marketplace, file: loadFile(deps.stateFile, { readOnly: true }), list: mkts });
  setMarketplace(name);
  if (note) progress.note?.(dim(note));
  let refreshError = null;
  const pull = t('拉取插件列表');
  {
    // 只读命令刷新失败不算失败（用本地副本继续），在转圈步骤内部吞掉
    try {
      await progress.step(pull, () => claude.updateMarketplace(MARKETPLACE).catch((e) => {
        if (!readOnly) throw e;
        refreshError = e.message;
      }));
    } catch (e) {
      throw new PreconditionError(t('拉取最新插件列表失败: {0}', e.brief ?? e.message), GIT_AUTH.test(e.message) ? GIT_HINT() : NET_HINT());
    }
  }
  const loc = mkts.find((m) => m.name === MARKETPLACE)?.installLocation;
  if (!loc) throw new PreconditionError(t('未找到 marketplace {0} 的本地副本', MARKETPLACE), t('运行 claude plugin marketplace update {0} 后重试', MARKETPLACE));

  // listInstalled 与本地文件读取并发；转圈期间不输出其他内容
  const listing = progress.step(t('读取已安装插件'), () => listingP);
  listing.catch(() => {});
  const catalog = loadCatalog(loc, log);
  const { presets, warning } = loadPresets(join(loc, 'presets.json'));
  const state = loadState(deps.stateFile, { readOnly: dryRun || readOnly });
  Object.assign(ctx, { claude, catalog, presets, state, prompter, progress, out, log, yes, dryRun, readOnly, refreshError, logFile: deps.logFile, stateFile: deps.stateFile });
  applyListing(ctx, await listing);
  const { installed } = ctx;
  if (warning) warn(warning, warning.includes(t('升级')) ? t('升级 ccpm 到最新版本') : t('联系 {0} 的维护者修复 presets.json', MARKETPLACE)).forEach((l) => progress.note?.(l));
  if (progress.summary) {
    const mineCount = installed.filter((p) => p.marketplace === MARKETPLACE).length;
    const parts = [MARKETPLACE, refreshError ? t('插件列表更新失败，使用本地副本') : t('插件列表已更新')];
    if (readOnly) parts.push(t('{0} 个已装', mineCount));
    Object.assign(progress.summary, { text: parts.join(' · '), warn: Boolean(refreshError) });
  }
  return ctx;
}

// 按 ctx.scope 从完整的已装列表里取出当前范围的插件
function applyListing(ctx, listing) {
  const cwd = resolve(process.cwd());
  ctx.listing = listing;
  ctx.installed = listing.filter(
    (p) => p.scope === ctx.scope && (ctx.scope !== 'project' || (p.projectPath && samePath(p.projectPath, cwd))),
  );
  // 当前项目视角下，全局装的插件同样可用：只用于展示，不参与计划
  ctx.globalNames = new Map(ctx.scope === 'project'
    ? listing.filter((p) => p.scope === 'user' && p.marketplace === MARKETPLACE).map((p) => [p.name, p.version])
    : []);
}

// 交互界面：切换全局 / 当前项目，不重新拉取插件列表；配置按新范围重新检查，MCP 列表沿用
export async function setScope(ctx, scope) {
  const userMcp = ctx.probe ? (await ctx.probe).userMcp : undefined;
  ctx.scope = scope;
  applyListing(ctx, ctx.listing);
  ctx.probe = probe(ctx, { userMcp });
}

// 交互界面：操作之后重新读取已装列表和 ccpm.json；只重查装/改过的插件的配置（不转圈）。
// touched：刚操作过的插件名；mcp=true 时重查 claude mcp list
export async function refreshInstalled(ctx, touched = [], { mcp = false } = {}) {
  const key = (p) => `${p.version}|${p.enabled}`;
  const before = new Map(ctx.installed.map((p) => [p.name, key(p)]));
  applyListing(ctx, await ctx.claude.listInstalled());
  ctx.state = loadState(ctx.stateFile, { readOnly: true });
  const after = new Map(ctx.installed.map((p) => [p.name, key(p)]));
  const changed = new Set(touched);
  for (const n of new Set([...before.keys(), ...after.keys()])) if (before.get(n) !== after.get(n)) changed.add(n);
  const prev = ctx.probe ? await ctx.probe : { unconfigured: new Map(), checked: new Set() };
  const keep = (names) => [...names].filter((n) => !changed.has(n));
  ctx.probe = probe(ctx, {
    unconfigured: new Map(keep(prev.unconfigured.keys()).map((n) => [n, prev.unconfigured.get(n)])),
    checked: new Set(keep(prev.checked ?? [])),
    userMcp: mcp ? undefined : prev.userMcp,
  }, (_label, fn) => fn());
}

// 只查确实需要的：有必填配置的插件才查配置；有 MCP 的插件才跑（很慢的）claude mcp list
// prev：已查过的结果（checked 里的插件不再查；userMcp 已有就沿用）
async function probe(ctx, prev = {}, step = ctx.progress.step) {
  const mine = ctx.installed.filter((p) => p.marketplace === MARKETPLACE && ctx.catalog.has(p.name));
  const needCfg = mine.filter((p) => requiredKeys(ctx.catalog.get(p.name)).length && !prev.checked?.has(p.name));
  const needMcp = !prev.userMcp && mine.some((p) => ctx.catalog.get(p.name).mcpServers.length);
  const [cfg, userMcp] = await Promise.all([
    needCfg.length
      ? step(t('检查插件配置'), () => Promise.all(needCfg.map((p) => ctx.claude.getUnconfigured(toId(p.name)).catch(() => null))))
      : [],
    needMcp ? step(t('检查 MCP 配置'), () => ctx.claude.listUserMcp().catch(() => [])) : prev.userMcp ?? null,
  ]);
  const unconfigured = new Map([...(prev.unconfigured ?? []), ...needCfg.map((p, i) => [p.name, cfg[i]]).filter(([, k]) => k)]);
  return { unconfigured, checked: new Set([...(prev.checked ?? []), ...needCfg.map((p) => p.name)]), userMcp };
}

// 预设只对全局（user）生效：--scope project 时不看预设
export async function gatherPlan(ctx) {
  ctx.probe ??= probe(ctx);
  const { unconfigured, userMcp } = await ctx.probe;
  const user = ctx.scope !== 'project';
  const plan = computePlan({
    installed: ctx.installed, catalog: ctx.catalog, state: user ? ctx.state : null, presets: user ? ctx.presets : {}, unconfigured, userMcp: userMcp ?? [],
  });
  const mine = ctx.installed.filter((p) => p.marketplace === MARKETPLACE);
  plan.inferredPresets = !ctx.state && user ? inferPresets(ctx.presets, new Set(mine.map((p) => p.name))) : [];
  return plan;
}

const CCPM_CMD = /\bccpm (status|install|update|sync|config|enable|disable|remove)((?: [A-Za-z0-9@._-]+)*)/g;
export const withScope = (line) =>
  String(line).replace(CCPM_CMD, (m) => (m.includes('--scope') ? m : `${m} --scope project`));
// 需要先对齐再输出的命令，提前加上 --scope project
export const scoped = (ctx, cmd) => (ctx.scope === 'project' ? withScope(cmd) : cmd);

// 命令出错时给用户看的几行（命令行和交互界面共用）
export const failLines = (e) => (e instanceof PreconditionError
  ? error(e.message)
  : error(t('出错了：{0}', e.brief ?? e.message), t('重试一次；仍失败请运行 ccpm log，把日志文件发给维护者')));
