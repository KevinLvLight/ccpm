import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareVersions } from '../plan.js';
import { createProgress } from '../progress.js';
import { I, bold, dim, error } from '../ui.js';
import { t } from '../i18n/index.js';

const pkg = () => {
  try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')); } catch { return {}; }
};
const firstLine = (s) => String(s).split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 120) ?? '';
const shell = (args, timeout = 10 * 60_000) => new Promise((resolve) => {
  const p = spawn('npm', args, { shell: process.platform === 'win32', windowsHide: true, timeout });
  let stdout = '', stderr = '';
  p.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
  p.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
  p.on('error', (e) => resolve({ code: 1, stdout, stderr: e.message }));
  p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
});

export const defaultSys = () => ({ npm: (args) => shell(args) });

// 只升级全局安装的 ccpm；网页和命令行共用，网页把输出实时呈现为操作记录。
export async function run(ctx) {
  const { out, prompter, dryRun, log = () => {}, sys = defaultSys() } = ctx;
  const progress = ctx.progress ?? createProgress({ out, animate: Boolean(process.stdout.isTTY) });
  const p = ctx.pkg ?? pkg();
  const { name, version: current } = p;
  if (!name || !current) {
    error(t('无法确定 Plugin Manager 的安装来源'), t('从 npm 全局安装后才能在这里更新')).forEach(out);
    return 1;
  }
  out(t('当前版本 {0}，正在查询最新版本…', bold(current)));
  const view = await sys.npm(['view', name, 'version', '--fetch-timeout=15000', '--fetch-retries=0']);
  const latest = view.code === 0 ? view.stdout.trim().split(/\s+/).pop() : '';
  log(`upgrade: npm view ${name} → ${view.code} ${latest || firstLine(view.stderr)}`);
  if (!/^\d+\.\d+\.\d+/.test(latest ?? '')) {
    error(t('查不到 Plugin Manager 的最新版本'), t('检查网络或 npm 源：{0}', firstLine(view.stderr) || t('超时'))).forEach(out);
    return 1;
  }
  if (compareVersions(latest, current) <= 0) {
    out(`${I.ok} ${t('已是最新版本 {0}', bold(current))}`);
    return 0;
  }
  out(`${dim(t('最新版本'))}  ${bold(latest)}`);
  if (dryRun) { out(dim(t('预览：会执行 npm install -g {0}@{1}', name, latest))); return 0; }
  if (!(await prompter.confirm(t('更新 Plugin Manager {0} → {1}？', current, latest), { default: true }))) {
    out(dim(t('已取消，没有做任何改动'))); return 0;
  }
  try {
    await progress.step(t('正在安装 Plugin Manager {0}', latest), async () => {
      const result = await sys.npm(['install', '-g', `${name}@${latest}`]);
      log(`upgrade: npm install -g → ${result.code}\n${result.stderr}`);
      if (result.code !== 0) throw Object.assign(new Error('npm'), { brief: firstLine(result.stderr) || `exit ${result.code}` });
    }, t('已安装 {0}', latest), t('安装失败'));
  } catch (e) {
    error(t('更新失败：{0}', e.brief ?? e.message), t('可手动执行 npm install -g {0}@{1}', name, latest)).forEach(out);
    return 1;
  }
  out(`${I.ok} ${t('Plugin Manager 已从 {0} 更新到 {1}；重新运行 ccpm web 后生效', current, bold(latest))}`);
  return 0;
}
