// 生成 README 用的状态截图：docs/images/status.{en,zh}.svg
// 用 scripts/demo-env.js 搭的演示环境（临时 CLAUDE_CONFIG_DIR，不碰你自己的配置）。
// 运行：node scripts/screenshots.js（需要本机装有 claude）
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDemo } from './demo-env.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { tmp, config } = setupDemo();
process.env.CLAUDE_CONFIG_DIR = config;
process.chdir(tmp);
const ccpm = (args, lang) => execFileSync(process.execPath, [join(root, 'bin/ccpm.js'), ...args], {
  encoding: 'utf8', env: { ...process.env, CCPM_LANG: lang, FORCE_COLOR: '1' },
});


// ---------- 终端输出 → SVG ----------
const { width } = await import('../src/ui.js');
const PALETTE = { 31: '#f7768e', 32: '#9ece6a', 33: '#e0af68', 36: '#7dcfff', fg: '#c0caf5', dim: '#6b7394', bg: '#1a1b26', bar: '#24283b' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toSvg(text, title) {
  const CW = 8.4, LH = 19, PAD = 18, TOP = 50;
  const rows = text.replace(/\n+$/, '').split('\n');
  const cols = Math.max(60, ...rows.map((r) => width(r)));
  const W = Math.ceil(cols * CW + PAD * 2), H = TOP + rows.length * LH + PAD;
  const out = [];
  rows.forEach((row, y) => {
    let st = { bold: false, dim: false, inv: false, fg: null };
    let x = 0;
    for (const part of row.split(/(\x1b\[[0-9;]*m)/)) {
      const m = part.match(/^\x1b\[([0-9;]*)m$/);
      if (m) {
        for (const c of (m[1] || '0').split(';').map(Number)) {
          if (c === 0) st = { bold: false, dim: false, inv: false, fg: null };
          else if (c === 1) st.bold = true; else if (c === 2) st.dim = true; else if (c === 22) st.bold = st.dim = false;
          else if (c === 7) st.inv = true; else if (c === 27) st.inv = false;
          else if (c === 39) st.fg = null; else if (PALETTE[c]) st.fg = PALETTE[c];
        }
        continue;
      }
      if (!part) continue;
      const color = st.fg ?? (st.dim ? PALETTE.dim : PALETTE.fg);
      const py = TOP + y * LH;
      if (st.inv) out.push(`<rect x="${PAD + x * CW}" y="${py - 14}" width="${width(part) * CW}" height="${LH}" fill="${color}"/>`);
      // 每个“词”（连续的单宽字符）或每个双宽字符单独定位到它的格子上，保证对齐
      for (const m2 of part.matchAll(/[\x21-\x7e\u00a0-\u10ff\u2000-\u2dff]+|[^\s]/gu)) {
        const before = width(part.slice(0, m2.index));
        const w = width(m2[0]);
        out.push(`<text x="${(PAD + (x + before) * CW).toFixed(1)}" y="${py}"${w > 1 && /^[\x21-\x7e]+$/.test(m2[0]) ? ` textLength="${(w * CW).toFixed(1)}"` : ''} fill="${st.inv ? PALETTE.bg : color}"${st.bold ? ' font-weight="bold"' : ''}>${esc(m2[0])}</text>`);
      }
      x += width(part);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="10" fill="${PALETTE.bg}"/>
<rect width="${W}" height="26" rx="10" fill="${PALETTE.bar}"/><rect y="16" width="${W}" height="10" fill="${PALETTE.bar}"/>
<circle cx="18" cy="13" r="5.5" fill="#ff5f57"/><circle cx="36" cy="13" r="5.5" fill="#febc2e"/><circle cx="54" cy="13" r="5.5" fill="#28c840"/>
<text x="${W / 2}" y="17" text-anchor="middle" fill="${PALETTE.dim}" font-size="12">${esc(title)}</text>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Noto Sans Mono CJK SC', 'PingFang SC', monospace" font-size="14" xml:space="preserve">
${out.join('\n')}
</g></svg>
`;
}

// ---------- 截图 ----------
const imgDir = join(root, 'docs/images');
mkdirSync(imgDir, { recursive: true });
for (const lang of ['en', 'zh']) {
  // status：真实命令的完整输出（去掉第一行的版本号标题和准备阶段的耗时）
  const status = ccpm(['status', '--yes'], lang).replace(/(\s+)[\d.]+s(\x1b\[[0-9;]*m)*\n/, '$2\n');
  writeFileSync(join(imgDir, `status.${lang}.svg`), toSvg(`$ ccpm status\n${status}`, 'ccpm status'));

  console.log(`wrote docs/images/status.${lang}.svg`);
}
