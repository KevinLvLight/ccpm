import { spawn } from 'node:child_process';

export const MARKETPLACE = 'acme-plugins';
export const MARKETPLACE_SOURCE = 'https://git.example.com/acme/plugins.git';
export const toId = (name) => name + '@' + MARKETPLACE;

export class ClaudeError extends Error {
  constructor(args, code, stderr) {
    super(`claude ${args.join(' ')} 失败 (exit ${code}): ${stderr}`);
    this.name = 'ClaudeError';
    this.args = args;
    this.code = code;
    this.stderr = stderr;
  }

  // 汇总里用的一行短错误
  get brief() {
    const line = String(this.stderr ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    return line ? line.slice(0, 100) : `exit ${this.code}`;
  }
}

const cap = (s) => (s.length > 4096 ? s.slice(0, 4096) + '…(截断)' : s);

// Windows 上 claude 是 .cmd/.ps1 包装，必须经 shell 解析。
export function spawnSpec(platform) {
  return { command: 'claude', shell: platform === 'win32' };
}

// shell 模式下参数会被 cmd 解析，只放行白名单字符（空格会被加引号）
export function assertSafeArgs(args) {
  for (const a of args) {
    if (!/^[A-Za-z0-9@._:/= -]*$/.test(a)) throw new Error(`参数含不安全字符: ${a}`);
  }
}

function defaultRun(args, opts = {}) {
  const { command, shell } = spawnSpec(process.platform);
  if (shell) assertSafeArgs(args);
  // shell 模式下参数会被拼成一行，含空格的需加引号
  const argv = shell ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
  return new Promise((resolve, reject) => {
    const p = spawn(command, argv, { shell, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    p.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    p.stdin.on('error', () => {});
    p.stdin.end(opts.input ?? '');
  });
}

// log：诊断日志（可选）。stdin 只记 JSON 的键名，绝不记值。
export function createClaude({ run: rawRun = defaultRun, log } = {}) {
  const run = !log ? rawRun : async (args, opts) => {
    const t0 = Date.now();
    let keys = '';
    if (opts?.input) {
      try { keys = ` stdin keys: ${Object.keys(JSON.parse(opts.input)).join(', ')}`; } catch { keys = ' stdin: (非 JSON，未记录)'; }
    }
    try {
      const r = await rawRun(args, opts);
      log(`claude ${args.join(' ')}${keys} → exit ${r.code} ${Date.now() - t0}ms\nstdout: ${cap(r.stdout ?? '')}\nstderr: ${cap(r.stderr ?? '')}`);
      return r;
    } catch (e) {
      log(`claude ${args.join(' ')}${keys} → 启动失败 ${Date.now() - t0}ms: ${e.message}`);
      throw e;
    }
  };
  const exec = async (args, opts) => {
    const r = await run(args, opts);
    if (r.code !== 0) throw new ClaudeError(args, r.code, (r.stderr || r.stdout || '').trim());
    return r.stdout;
  };
  const json = async (args) => JSON.parse(await exec(args));
  const idOf = (id) => ({ id, name: id.split('@')[0], marketplace: id.split('@')[1] });

  return {
    async checkCapabilities() {
      try {
        const r = await run(['plugin', 'configure', '--help']);
        const out = r.stdout + r.stderr;
        // Windows 经 shell 启动：claude 不存在时 cmd 返回非 0 且输出不含 configure
        const missing = out.includes('--values-stdin') ? []
          : r.code !== 0 && !/configure/i.test(out) ? ['claude'] : ['--values-stdin'];
        return { ok: !missing.length, missing };
      } catch {
        return { ok: false, missing: ['claude'] };
      }
    },
    async listInstalled() {
      const list = await json(['plugin', 'list', '--json']);
      return list.map((e) => ({
        ...idOf(e.id), version: e.version, scope: e.scope, enabled: e.enabled, projectPath: e.projectPath,
      }));
    },
    async listAvailable(marketplace) {
      const { available = [] } = await json(['plugin', 'list', '--available', '--json']);
      return available
        .filter((p) => p.marketplaceName === marketplace)
        .map((p) => ({ name: p.name, version: p.version }));
    },
    async listMarketplaces() {
      const l = await json(['plugin', 'marketplace', 'list', '--json']);
      return l.map((m) => ({ name: m.name, installLocation: m.installLocation }));
    },
    async addMarketplace(source) { await exec(['plugin', 'marketplace', 'add', source]); },
    async updateMarketplace(name) { await exec(['plugin', 'marketplace', 'update', name]); },
    async getUnconfigured(id) {
      return (await json(['plugin', 'configure', id, '--json'])).unconfigured ?? [];
    },
    async install(id, { scope }) {
      await exec(['plugin', 'install', id, '-s', scope, '-y']);
    },
    async configure(id, values) {
      await exec(['plugin', 'configure', id, '--values-stdin'], { input: JSON.stringify(values) });
    },
    async update(id, { scope }) { await exec(['plugin', 'update', id, '-s', scope]); },
    async uninstall(id, { scope }) { await exec(['plugin', 'uninstall', id, '-s', scope]); },
    async enable(id, { scope }) { await exec(['plugin', 'enable', id, '-s', scope]); },
    async disable(id, { scope }) { await exec(['plugin', 'disable', id, '-s', scope]); },
    // 只做 dry-run：真正清理由调用方逐个 uninstall（prune -y 会波及其他 marketplace）
    async prune({ scope }) {
      const args = ['plugin', 'prune', '-s', scope, '--dry-run'];
      const r = await run(args);
      if (r.code !== 0) throw new ClaudeError(args, r.code, (r.stderr || r.stdout || '').trim());
      const out = r.stdout + '\n' + r.stderr;
      const skipped = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('Skipped'));
      if (skipped) return { ids: [], note: skipped };
      return { ids: out.match(/\S+@\S+/g) ?? [] };
    },
    async listUserMcp() {
      const names = [];
      for (const line of (await exec(['mcp', 'list'])).split(/\r?\n/)) {
        const m = /^(\S[^:]*): /.exec(line);
        if (m && !m[1].startsWith('plugin:')) names.push(m[1]);
      }
      return names;
    },
  };
}
