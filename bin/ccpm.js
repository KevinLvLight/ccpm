#!/usr/bin/env node
import { t } from '../src/i18n/index.js';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { failLines, loadContext, PreconditionError } from '../src/context.js';
import { createClaude } from '../src/claude.js';
import { createPrompter } from '../src/prompt.js';
import { createProgress } from '../src/progress.js';
import { createLogger } from '../src/log.js';
import { helpText } from '../src/help.js';
import { bold, dim, error } from '../src/ui.js';

// Web 是唯一的插件变更入口；命令行仅保留脚本查询和维护操作。
const READ_ONLY = ['status', 'list'];
const COMMANDS = [...READ_ONLY];
const LOCAL = ['help', 'log', 'check', 'upgrade', 'cc-update']; // 不调用 ccpm 的 Claude marketplace 操作
const SETUP = ['use', 'web']; // 不需要先选定 marketplace（web 在页面里选）

async function main(argv, deps = {}) {
  const print = deps.out ?? ((l) => console.log(l));
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'dry-run': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        scope: { type: 'string', default: 'user' },
        marketplace: { type: 'string' },
        show: { type: 'boolean' },
        port: { type: 'string' },
        'no-open': { type: 'boolean' },
        tries: { type: 'string' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    error(e.message, t('运行 ccpm help 查看所有命令和选项')).forEach(print);
    return 1;
  }
  const { values: flags, positionals } = parsed;
  // 直接运行打开本地 Web 管理器；--yes 保留非交互脚本的 status 语义。
  const [given, ...rest] = positionals;
  const cmd = given ?? (flags.yes ? 'status' : 'web');

  if (cmd === 'help' || flags.help) {
    const topic = cmd === 'help' ? rest[0] : positionals.length ? cmd : undefined;
    const text = helpText(topic);
    if (text === null) {
      error(t('没有“{0}”的帮助', topic), t('运行 ccpm help 查看所有命令')).forEach(print);
      return 1;
    }
    print(text);
    return 0;
  }
  if (!COMMANDS.includes(cmd) && !LOCAL.includes(cmd) && !SETUP.includes(cmd)) {
    error(t('未知命令：{0}', cmd), t('运行 ccpm help 查看所有命令')).forEach(print);
    return 1;
  }
  if (!['user', 'project'].includes(flags.scope)) {
    error(t('--scope 只能是 user（全局）或 project（当前项目），收到：{0}', flags.scope), t('去掉 --scope，或写成 --scope project')).forEach(print);
    return 1;
  }

  const logger = deps.logger ?? createLogger({ mirror: flags.verbose ? (l) => process.stderr.write(l + '\n') : undefined });
  if (cmd === 'check') return (await import('../src/commands/check.js')).run({ out: print }, rest);
  if (cmd === 'log') {
    print(t('今天的日志：{0}', logger.file));
    print(t('日志目录：  {0}', logger.dir));
    print(t('反馈问题时，把日志文件发给维护者即可（里面不含 token、密码）。'));
    return 0;
  }
  const log = logger.write;
  let logShown = false; // 结果卡片里已经给出日志路径时，结尾不再重复
  const out = (l) => { if (String(l).includes(logger.file)) logShown = true; print(l); log(`out: ${l}`); };
  const interactive = Boolean(process.stdin.isTTY) && !flags.yes;
  let version = '?';
  try { version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch {}
  log(`==== ccpm ${version} node ${process.version} ${process.platform}/${process.arch} cwd=${process.cwd()} argv=${JSON.stringify(argv)} scope=${flags.scope} interactive=${interactive ? 'yes' : 'no'}`);
  if (cmd === 'web') {
    const { runWeb } = await import('../src/web/index.js');
    const code = await runWeb({ flags, log, logFile: logger.file, print });
    log(`exit code ${code}`);
    return code;
  }
  out(`${bold('ccpm')} ${dim(`${version} · ${flags.scope === 'project' ? t('当前项目') : t('全局')}`)}`);

  if (cmd === 'upgrade' || cmd === 'cc-update') {
    const prompter = deps.context?.prompter ?? createPrompter({ input: process.stdin, output: process.stdout, interactive, log });
    const progress = createProgress({ out, animate: Boolean(process.stdout.isTTY) && !flags.yes });
    const mod = await import(`../src/commands/${cmd}.js`);
    const code = await mod.run({ out, log, prompter, progress, dryRun: Boolean(flags['dry-run']) }, rest, flags);
    log(`exit code ${code}`);
    return code;
  }

  if (cmd === 'use') {
    try {
      const claude = deps.context?.claude ?? createClaude({ log });
      const prompter = deps.context?.prompter ?? createPrompter({ input: process.stdin, output: process.stdout, interactive, log });
      const progress = createProgress({ out, animate: Boolean(process.stdout.isTTY) && !flags.yes });
      const code = await (await import('../src/commands/use.js')).run({ claude, prompter, out, progress, stateFile: deps.context?.stateFile }, rest, flags);
      log(`exit code ${code}`);
      return code;
    } catch (e) {
      log(`exception: ${e.stack ?? e}`);
      failLines(e).forEach(out);
      return e instanceof PreconditionError ? 2 : 1;
    }
  }

  const code = await (async () => {
    try {
      const mod = await import(`../src/commands/${cmd}.js`);
      const ctx = await loadContext(
        { scope: flags.scope, marketplace: flags.marketplace, yes: Boolean(flags.yes), dryRun: Boolean(flags['dry-run']), readOnly: READ_ONLY.includes(cmd) },
        { ...deps.context, out, log, logFile: logger.file },
      );
      return await mod.run(ctx, rest, flags);
    } catch (e) {
      log(`exception: ${e.stack ?? e}`);
      failLines(e).forEach(out);
      return e instanceof PreconditionError ? 2 : 1;
    }
  })();
  log(`exit code ${code}`);
  if (code !== 0 && !logShown) print(`  ${dim(t('详细日志：{0}', logger.file))}`);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
