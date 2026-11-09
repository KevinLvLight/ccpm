// 演示环境：一个演示 marketplace（8 个插件、2 个预设），用真实的 claude 在临时的 CLAUDE_CONFIG_DIR 里
// 摆出各种状态（已装、可更新、缺配置、已停用）。不碰你自己的配置。
// 单独运行：node scripts/demo-env.js → 打印要设置的 CLAUDE_CONFIG_DIR；screenshots.js 也用它。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function setupDemo() {
  const tmp = mkdtempSync(join(tmpdir(), 'ccpm-shots-'));
  const config = join(tmp, 'claude');
  const mkt = join(tmp, 'demo-plugins');

  // ---------- 演示 marketplace ----------
  const PLUGINS = [
    ['git-helper', '1.2.0', 'Commit messages and PR descriptions'],
    ['code-review', '2.0.1', 'Review your diff before you push'],
    ['docs-search', '1.0.0', 'Search team docs and API references'],
    ['db-tool', '1.1.0', 'Read-only SQL on your dev database', {
      db_url: { type: 'string', title: 'Database URL', required: true, description: 'e.g. postgres://localhost:5432/app' },
      db_password: { type: 'string', title: 'Password', sensitive: true, required: true, description: 'password of a read-only user' },
    }],
    ['browser-mcp', '1.0.0', 'Drive a headless browser from Claude'],
    ['test-runner', '0.9.0', 'Run tests and explain failures', null, ['git-helper']],
    ['issue-tracker', '1.4.0', 'Look up and update issues', {
      token: { type: 'string', title: 'API token', sensitive: true, required: true, description: 'create one in your tracker settings' },
    }],
    ['deploy-kit', '0.3.0', 'Deploy to staging in one step', null, ['issue-tracker']],
  ];
  const PRESETS = {
    starter: { description: 'Everyday tools', plugins: ['git-helper', 'code-review', 'docs-search'] },
    fullstack: { description: 'Web app development', plugins: ['starter', 'browser-mcp', 'db-tool', 'test-runner'] },
  };
  const write = (f, data) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); };
  const manifest = (name, version, description, userConfig, deps) => ({
    name, version, description,
    ...(deps ? { dependencies: deps.map((d) => `${d}@demo-plugins`) } : {}),
    ...(userConfig ? { userConfig } : {}),
  });
  write(join(mkt, '.claude-plugin/marketplace.json'), {
    name: 'demo-plugins', owner: { name: 'Demo' },
    plugins: PLUGINS.map(([name, , description]) => ({ name, source: `./plugins/${name}`, description })),
  });
  for (const [name, version, description, userConfig, deps] of PLUGINS) {
    write(join(mkt, `plugins/${name}/.claude-plugin/plugin.json`), manifest(name, version, description, userConfig, deps));
    write(join(mkt, `plugins/${name}/skills/${name}/SKILL.md`), `---\nname: ${name}\ndescription: ${description}\n---\n${description}.\n`);
  }
  write(join(mkt, 'presets.json'), { formatVersion: 1, presets: PRESETS });

  // ---------- 用真实的 claude 摆出各种状态 ----------
  const claude = (...args) => execFileSync('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: config } });
  claude('plugin', 'marketplace', 'add', mkt);
  for (const p of ['git-helper', 'code-review', 'docs-search', 'db-tool']) claude('plugin', 'install', `${p}@demo-plugins`, '-s', 'user');
  claude('plugin', 'disable', 'code-review@demo-plugins', '-s', 'user');
  write(join(config, 'ccpm.json'), { current: 'demo-plugins', marketplaces: { 'demo-plugins': { presets: ['starter'], excluded: [] } } });
  // 发一个新版本，让 git-helper 显示“可更新”
  write(join(mkt, 'plugins/git-helper/.claude-plugin/plugin.json'), manifest('git-helper', '1.3.0', PLUGINS[0][2]));
  write(join(mkt, 'plugins/git-helper/CHANGELOG.md'), '# Changelog\n\n## [1.3.0]\n\n- Suggest a branch name from the issue title\n');
  return { tmp, config, mkt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { config } = setupDemo();
  console.log(`export CLAUDE_CONFIG_DIR=${config}`);
}
