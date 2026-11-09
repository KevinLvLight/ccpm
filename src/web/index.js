// ccpm web：启动本地网页界面。只监听 127.0.0.1；打开浏览器；Ctrl+C 结束。
import { spawn } from 'node:child_process';
import { createWebSession } from './session.js';
import { createWebServer, newToken } from './server.js';
import { t } from '../i18n/index.js';
import { bold, dim, error, setColor } from '../ui.js';

// 用系统默认浏览器打开；失败无所谓（链接已经打印在终端里）
export function openBrowser(url, platform = process.platform) {
  const [cmd, args] = platform === 'darwin' ? ['open', [url]]
    : platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => {});
    p.unref();
  } catch {}
}

// 返回 { url, server, session, stop }；stop() 关闭服务
export async function startWeb({ flags = {}, log = () => {}, context = {}, port = 0, token = newToken() } = {}) {
  setColor(true); // 记录区的颜色交给网页按 ANSI 显示
  const session = createWebSession({ context, flags, log });
  const server = createWebServer({ session, token });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/?t=${token}`;
  session.load();
  const stop = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
  return { url, server, session, stop };
}

// 命令行入口：打印链接、打开浏览器，一直运行到 Ctrl+C
export async function runWeb({ flags = {}, log = () => {}, logFile, print = console.log } = {}) {
  const port = flags.port === undefined ? 0 : Number(flags.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    error(t('--port 要写 0 到 65535 之间的数字，收到：{0}', flags.port), t('去掉 --port，ccpm 会自己挑一个空闲端口')).forEach(print);
    return 1;
  }
  let web;
  try {
    web = await startWeb({ flags, log, context: { logFile }, port });
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    error(t('端口 {0} 已被占用', port), t('换一个端口，或去掉 --port')).forEach(print);
    return 1;
  }
  const { url, stop } = web;
  log('web: listening on 127.0.0.1');
  print(`${bold('ccpm web')}  ${url}`);
  print(dim(t('浏览器没有自动打开时，复制上面的链接打开；按 Ctrl+C 退出')));
  if (!flags['no-open']) openBrowser(url);
  await new Promise((resolve) => process.once('SIGINT', resolve));
  await stop();
  return 0;
}
