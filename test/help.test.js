process.env.CCPM_LANG ??= 'zh'; // 断言按中文文案写
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_NAMES, helpText } from '../src/help.js';
import * as zh from '../src/i18n/help.zh.js';
import * as en from '../src/i18n/help.en.js';
import { setMarketplace as useMarketplace } from '../src/claude.js';
useMarketplace('acme-plugins'); // 单元测试不走 loadContext，直接指定

const bin = fileURLToPath(new URL('../bin/ccpm.js', import.meta.url));
// PATH 置空：任何 claude 调用都会失败（退出码 2），从而证明帮助不调用 claude
const ccpm = (...args) => spawnSync(process.execPath, [bin, ...args], {
  encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent', CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'ccpm-cfg-')) },
});

const SECTIONS = {
  zh: ['用途', '用法', '参数', '选项', '示例', '会做什么', '不会做什么', '常见问题'],
  en: ['Purpose', 'Usage', 'Arguments', 'Options', 'Examples', 'What it does', 'What it does not do', 'FAQ'],
};

test('每个命令都有完整的帮助页（中英文）', () => {
  for (const c of ['use', 'ui', 'status', 'list', 'install', 'config', 'enable', 'disable', 'remove', 'update', 'sync', 'check', 'log', 'help']) {
    assert.ok(COMMAND_NAMES.includes(c), c);
    for (const [l, h] of [['zh', zh], ['en', en]]) {
      const t = helpText(c, h);
      for (const sec of SECTIONS[l]) assert.match(t, new RegExp(`\n${sec}:`), `${l} ${c} ${sec}`);
    }
  }
  for (const t of ['concepts', 'troubleshooting']) assert.ok(helpText(t, zh) && helpText(t, en));
  for (const t of [undefined, ...COMMAND_NAMES, 'concepts', 'troubleshooting']) assert.doesNotMatch(helpText(t, en), /[\u4e00-\u9fff]/, `en ${t}`);
});

test('README 的用法一节与 help 一致（README.md 英文，README.zh-CN.md 中文）', () => {
  for (const [file, h] of [['README.md', en], ['README.zh-CN.md', zh]]) {
    const readme = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const t of [undefined, ...COMMAND_NAMES, 'concepts', 'troubleshooting']) assert.ok(readme.includes(helpText(t, h)), `${file} 缺少 ${t ?? '总览'}，运行 node scripts/readme.js 重新生成`);
  }
});

test('help 入口不调用 claude；未知主题退出 1', () => {
  for (const args of [['help'], ['-h'], ['--help'], ['help', 'install'], ['install', '--help'], ['help', 'troubleshooting']]) {
    const r = ccpm(...args);
    assert.equal(r.status, 0, args.join(' '));
  }
  assert.match(ccpm('install', '--help').stdout, /^ccpm install — /);
  assert.match(ccpm('help').stdout, /一键安装 \/ 配置 \/ 更新 Claude Code 插件/);
  assert.equal(ccpm('help', 'xyz').status, 1);
});

