import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareVersions } from '../plan.js';
import { createProgress } from '../progress.js';
import { I, bold, box, dim, error } from '../ui.js';
import { t } from '../i18n/index.js';

const PACKAGE = '@anthropic-ai/claude-code';
const STABLE = /^\d+\.\d+\.\d+$/;
export const DEFAULT_TRIES = 5;
const firstLine = (s) => String(s).split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 120) ?? '';
const shell = (command, args, timeout = 10 * 60_000) => new Promise((resolve) => {
  const p = spawn(command, args, { shell: process.platform === 'win32', windowsHide: true, timeout });
  let stdout = '', stderr = '';
  p.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
  p.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
  p.on('error', (e) => resolve({ code: 1, stdout, stderr: e.message }));
  p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
});
export const defaultSys = () => ({
  npm: (args) => shell('npm', args),
  claudeVersion: async () => {
    const result = await shell('claude', ['--version'], 60_000);
    const version = result.stdout.match(/\d+\.\d+\.\d+/)?.[0];
    return result.code === 0 && version ? { ok: true, version } : { ok: false, error: firstLine(result.stderr || result.stdout) || `exit ${result.code}` };
  },
  packageVersion(root) { try { return JSON.parse(readFileSync(join(root, ...PACKAGE.split('/'), 'package.json'), 'utf8')).version; } catch { return null; } },
});

// 只安装、验证和必要时回退，不删除 npm 目录或修改 Claude Code 的自动更新设置。
export async function run(ctx, args = [], flags = {}) {
  const { out, prompter, dryRun, log = () => {}, sys = defaultSys() } = ctx;
  const progress = ctx.progress ?? createProgress({ out, animate: Boolean(process.stdout.isTTY) });
  const target = args[0];
  const tries = flags.tries === undefined ? DEFAULT_TRIES : Number(flags.tries);
  if (!Number.isInteger(tries) || tries < 1 || tries > 50) { error(t('--tries 要写 1 到 50 的整数，收到：{0}', flags.tries), t('例如 ccpm cc-update --tries {0}', DEFAULT_TRIES)).forEach(out); return 1; }
  if (target !== undefined && !STABLE.test(target)) { error(t('版本号格式不对：{0}', target), t('例如 ccpm cc-update 2.1.112')).forEach(out); return 1; }

  const root = await sys.npm(['root', '-g']);
  const installed = root.code === 0 ? sys.packageVersion(root.stdout.trim()) : null;
  if (!installed) { error(t('没找到用 npm 全局安装的 Claude Code'), t('ccpm cc-update 只管理 npm 全局安装的 Claude Code')).forEach(out); return 1; }
  const current = await sys.claudeVersion();
  log(`cc-update: npm ${installed}; claude --version ${current.ok ? current.version : `failed ${current.error}`}`);
  if (!current.ok && !target) { error(t('当前的 Claude Code {0} 无法启动：{1}', installed, current.error), t('请指定要安装的版本，例如 ccpm cc-update 2.1.112')).forEach(out); return 1; }
  const original = current.ok ? installed : null;

  const view = await sys.npm(['view', PACKAGE, 'versions', 'dist-tags', '--json']);
  let info; try { info = JSON.parse(view.stdout); } catch {}
  if (view.code !== 0 || !info?.versions) { error(t('查不到 Claude Code 的可用版本'), t('检查网络和 npm 源：{0}', firstLine(view.stderr) || t('npm 查询失败'))).forEach(out); return 1; }
  const latest = info['dist-tags']?.latest;
  let candidates;
  if (target) {
    if (!info.versions.includes(target)) { error(t('没有 {0} 这个版本', target), t('最新版是 {0}', latest)).forEach(out); return 1; }
    if (target === original) { out(`${I.ok} ${t('已经是 {0}，无需操作', target)}`); return 0; }
    candidates = [target];
  } else {
    candidates = info.versions.filter((v) => STABLE.test(v) && compareVersions(v, latest) <= 0 && compareVersions(v, original) > 0).sort((a, b) => compareVersions(b, a)).slice(0, tries);
    if (!candidates.length) { out(`${I.ok} ${t('Claude Code 已是最新版 {0}', original)}`); return 0; }
  }
  out(t('当前版本 {0}；将依次验证 {1}', original ?? installed, candidates.join(' → ')));
  if (dryRun) { out(dim(t('预览：不会安装或修改任何版本'))); return 0; }
  out(dim(t('请先关闭所有 Claude Code 窗口；升级期间不要关闭此页面')));
  if (!(await prompter.confirm(target ? t('安装 Claude Code {0}？', target) : t('开始安全更新 Claude Code？'), { default: true }))) { out(dim(t('已取消，没有做任何改动'))); return 0; }

  const install = async (version) => {
    try {
      await progress.step(t('正在安装 Claude Code {0}', version), async () => {
        const result = await sys.npm(['install', '-g', `${PACKAGE}@${version}`]);
        log(`cc-update: npm install ${version} → ${result.code}\n${result.stderr}`);
        if (result.code !== 0) throw Object.assign(new Error('npm'), { brief: firstLine(result.stderr) || `exit ${result.code}` });
      }, t('已安装 {0}', version), t('安装失败'));
      await progress.step(t('正在验证 Claude Code {0}', version), async () => {
        const checked = await sys.claudeVersion();
        if (!checked.ok) throw Object.assign(new Error(checked.error), { brief: checked.error });
      }, t('{0} 可以正常启动', version), t('{0} 无法启动'));
      return true;
    } catch { return false; }
  };
  const failed = [];
  let good = null;
  for (const [index, version] of candidates.entries()) {
    out(bold(`[${index + 1}/${candidates.length}] ${version}`));
    if (await install(version)) { good = version; break; }
    failed.push(version);
  }
  const restored = !good && original ? await install(original) : false;
  const lines = good ? [`${I.ok} ${t('Claude Code 已从 {0} 更新到 {1}', original ?? installed, good)}`]
    : restored ? [`${I.ok} ${t('已装回原来的 {0}，可以照常使用', original)}`] : [`${I.fail} ${t('现在没有可用的 Claude Code')}`];
  if (failed.length) lines.push(`${I.warn} ${t('无法启动：{0}', failed.join(t('、')))}`);
  if (good || restored) lines.push(dim(t('重新打开 Claude Code 后生效')));
  box(good ? t('升级完成') : restored ? t('未升级') : t('失败'), lines, good ? 'green' : restored ? 'yellow' : 'red').forEach(out);
  return good ? 0 : 1;
}
