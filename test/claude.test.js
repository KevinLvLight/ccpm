import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClaude, ClaudeError, spawnSpec, assertSafeArgs, MARKETPLACE, toId } from '../src/claude.js';

const fx = (n) => readFileSync(fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url)), 'utf8');
const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
const fake = (reply) => {
  const calls = [];
  const run = async (args, opts) => { calls.push({ args, opts }); return reply(args); };
  return { calls, claude: createClaude({ run }) };
};

test('toId / MARKETPLACE', () => assert.equal(toId('a'), 'a@' + MARKETPLACE));

test('spawnSpec', () => {
  assert.deepEqual(spawnSpec('win32'), { command: 'claude', shell: true });
  assert.deepEqual(spawnSpec('darwin'), { command: 'claude', shell: false });
});

test('listInstalled 返回全部条目', async () => {
  const { claude, calls } = fake(() => ok(fx('list.json')));
  const r = await claude.listInstalled();
  assert.deepEqual(calls[0].args, ['plugin', 'list', '--json']);
  const raw = JSON.parse(fx('list.json'));
  assert.equal(r.length, raw.length);
  assert.deepEqual(Object.keys(r[0]).sort(), ['enabled', 'id', 'marketplace', 'name', 'projectPath', 'scope', 'version']);
  assert.equal(r[0].name, 'gateway-mcp');
  assert.equal(r[0].marketplace, 'acme-plugins');
  assert.ok(r.some((x) => x.projectPath));
});

test('listAvailable 过滤 marketplace', async () => {
  const { claude, calls } = fake(() => ok(fx('list-available.json')));
  const r = await claude.listAvailable('acme-plugins');
  assert.deepEqual(calls[0].args, ['plugin', 'list', '--available', '--json']);
  assert.ok(r.length > 0);
  assert.ok(r.some((x) => x.name === 'mysql-mcp'));
  const all = JSON.parse(fx('list-available.json')).available;
  assert.equal(r.length, all.filter((x) => x.marketplaceName === 'acme-plugins').length);
  assert.ok(r.length < all.length);
});

test('listMarketplaces', async () => {
  const { claude, calls } = fake(() => ok(fx('marketplace-list.json')));
  const r = await claude.listMarketplaces();
  assert.deepEqual(calls[0].args, ['plugin', 'marketplace', 'list', '--json']);
  assert.ok(r.find((m) => m.name === 'acme-plugins').installLocation);
});

test('add/updateMarketplace', async () => {
  const { claude, calls } = fake(() => ok());
  await claude.addMarketplace('src');
  await claude.updateMarketplace('m');
  assert.deepEqual(calls[0].args, ['plugin', 'marketplace', 'add', 'src']);
  assert.deepEqual(calls[1].args, ['plugin', 'marketplace', 'update', 'm']);
});

test('getUnconfigured', async () => {
  const { claude, calls } = fake(() => ok(fx('configure-unset.json')));
  assert.deepEqual(await claude.getUnconfigured('s@acme-plugins'), ['url', 'token']);
  assert.deepEqual(calls[0].args, ['plugin', 'configure', 's@acme-plugins', '--json']);
});

test('install 参数', async () => {
  const { claude, calls } = fake(() => ok());
  await claude.install('a@acme-plugins', { scope: 'user' });
  assert.deepEqual(calls[0].args, ['plugin', 'install', 'a@acme-plugins', '-s', 'user', '-y']);
});

test('configure 值只走 stdin', async () => {
  const { claude, calls } = fake(() => ok());
  await claude.configure('a@acme-plugins', { token: 't' });
  assert.deepEqual(calls[0].args, ['plugin', 'configure', 'a@acme-plugins', '--values-stdin']);
  assert.equal(calls[0].opts.input, '{"token":"t"}');
});

test('update/uninstall/enable', async () => {
  const { claude, calls } = fake(() => ok());
  await claude.update('a@m', { scope: 'user' });
  await claude.uninstall('a@m', { scope: 'project' });
  await claude.enable('a@m', { scope: 'user' });
  assert.deepEqual(calls[0].args, ['plugin', 'update', 'a@m', '-s', 'user']);
  assert.deepEqual(calls[1].args, ['plugin', 'uninstall', 'a@m', '-s', 'project']);
  assert.deepEqual(calls[2].args, ['plugin', 'enable', 'a@m', '-s', 'user']);
});

test('prune dryRun: Skipped', async () => {
  const { claude, calls } = fake(() => ok(fx('prune-dry-run.txt')));
  const r = await claude.prune({ scope: 'user', dryRun: true });
  assert.deepEqual(calls[0].args, ['plugin', 'prune', '-s', 'user', '--dry-run']);
  assert.deepEqual(r.ids, []);
  assert.match(r.note, /^Skipped/);
});

test('prune dryRun: 解析 id', async () => {
  const { claude } = fake(() => ok('Would remove:\n  a@acme-plugins\n  b@other\n'));
  assert.deepEqual((await claude.prune({ scope: 'user', dryRun: true })).ids, ['a@acme-plugins', 'b@other']);
});

test('prune 只做 dry-run，Skipped 在 stderr 也识别；非 0 抛 ClaudeError', async () => {
  const { claude, calls } = fake(() => ({ code: 0, stdout: '', stderr: 'Skipped — x' }));
  assert.match((await claude.prune({ scope: 'user', dryRun: false })).note, /^Skipped/);
  assert.ok(!calls[0].args.includes('-y'));
  const bad = fake(() => ({ code: 1, stdout: '', stderr: 'nope' }));
  await assert.rejects(bad.claude.prune({ scope: 'user' }), { name: 'ClaudeError' });
});

test('checkCapabilities: Windows 缺 claude（cmd 非 0 且无 configure）→ missing claude', async () => {
  const { claude } = fake(() => ({ code: 1, stdout: '', stderr: "'claude' is not recognized" }));
  assert.deepEqual(await claude.checkCapabilities(), { ok: false, missing: ['claude'] });
});

test('listUserMcp', async () => {
  const { claude, calls } = fake(() => ok(fx('mcp-list.txt')));
  assert.deepEqual(await claude.listUserMcp(), [
    'codegraph', 'drawio', 'quality-mcp-server', 'quality-mcp-legacy', 'chrome-devtools', 'env-mcp',
  ]);
  assert.deepEqual(calls[0].args, ['mcp', 'list']);
});

test('非 0 退出码抛 ClaudeError（stderr，回退 stdout）', async () => {
  const { claude } = fake(() => ({ code: 1, stdout: 'out', stderr: 'boom' }));
  await assert.rejects(claude.update('a@m', { scope: 'user' }), (e) => {
    assert.ok(e instanceof ClaudeError);
    assert.match(e.message, /boom/);
    assert.match(e.message, /plugin update/);
    assert.equal(e.code, 1);
    assert.deepEqual(e.args.slice(0, 2), ['plugin', 'update']);
    return true;
  });
  const f = fake(() => ({ code: 1, stdout: '{"outcome":"failed"}', stderr: '' }));
  await assert.rejects(f.claude.install('a@m', { scope: 'user' }), /outcome/);
});

test('checkCapabilities', async () => {
  let r = await fake(() => ok('--values-stdin  read json')).claude.checkCapabilities();
  assert.deepEqual(r, { ok: true, missing: [] });
  const f = fake(() => ok('usage: configure'));
  r = await f.claude.checkCapabilities();
  assert.deepEqual(r, { ok: false, missing: ['--values-stdin'] });
  assert.deepEqual(f.calls[0].args, ['plugin', 'configure', '--help']);
});

test('checkCapabilities: claude 不存在', async () => {
  const claude = createClaude({ run: async () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); } });
  assert.deepEqual(await claude.checkCapabilities(), { ok: false, missing: ['claude'] });
});

test('assertSafeArgs', () => {
  assert.doesNotThrow(() => assertSafeArgs(['quality-mcp@acme-plugins', '-s', 'user', 'a b']));
  for (const bad of ['a&b', '"x"', '%PATH%', 'a|b', '^']) assert.throws(() => assertSafeArgs(['ok', bad]), /参数含不安全字符/);
});
