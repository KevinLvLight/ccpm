// 终端样式：颜色、符号、按显示宽度对齐、结果卡片。所有 ANSI 码只在这里出现。

export function colorEnabled(stream = process.stdout, env = process.env) {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') return env.FORCE_COLOR !== '0';
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.TERM === 'dumb') return false;
  return Boolean(stream?.isTTY);
}

let on = colorEnabled();
export const setColor = (v) => { on = Boolean(v); };

const sgr = (open, close) => (s) => (on ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
export const bold = sgr(1, 22);
export const dim = sgr(2, 22);
export const red = sgr(31, 39);
export const green = sgr(32, 39);
export const yellow = sgr(33, 39);
export const blue = sgr(36, 39);
export const inverse = sgr(7, 27);

// 全屏交互界面用到的终端控制码（Windows Terminal 均支持）
export const TERM = {
  enter: '\x1b[?1049h\x1b[?25l', // 备用屏幕 + 隐藏光标
  leave: '\x1b[0m\x1b[?25h\x1b[?1049l', // 显示光标 + 回到主屏幕
  home: '\x1b[H',
  eol: '\x1b[0m\x1b[K', // 行尾：复位颜色并清掉余下部分
  below: '\x1b[J',
};

// 只用单宽字符，不用 emoji
export const SYMBOLS = '✔✖↑▲○⏸+−?›●';
export const I = {
  get ok() { return green('✔'); },
  get fail() { return red('✖'); },
  get up() { return blue('↑'); },
  get warn() { return yellow('▲'); },
  get none() { return dim('○'); },
  get off() { return yellow('⏸'); },
  get add() { return green('+'); },
  get del() { return red('−'); },
  get ask() { return blue('?'); },
  get cmd() { return dim('›'); },
  get dot() { return green('●'); },
};

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
export const strip = (s) => String(s).replace(ANSI, '');

const WIDE = [[0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6]];
export function width(s) {
  let w = 0;
  for (const ch of strip(s)) {
    const c = ch.codePointAt(0);
    w += WIDE.some(([a, b]) => c >= a && c <= b) ? 2 : 1;
  }
  return w;
}
export const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
// 按显示宽度截断（保留颜色码），超出时以 … 结尾
export function truncate(s, n) {
  s = String(s);
  if (width(s) <= n) return s;
  let out = '';
  let w = 0;
  for (const part of s.split(/(\x1b\[[0-9;]*[A-Za-z])/)) {
    if (part.startsWith('\x1b[')) { out += part; continue; }
    for (const ch of part) {
      const cw = width(ch);
      if (w + cw > n - 1) return out + '…';
      out += ch;
      w += cw;
    }
  }
  return out;
}

// rows：单元格数组。每行最后一格不补空格；只有一格的行不参与对齐
export function table(rows, { indent = '  ', gap = '  ' } = {}) {
  const w = [];
  for (const r of rows) if (r.length > 1) r.slice(0, -1).forEach((c, i) => { w[i] = Math.max(w[i] ?? 0, width(c)); });
  return rows.map((r) => indent + r.map((c, i) => (i < r.length - 1 ? pad(c, w[i]) : c)).join(gap).trimEnd());
}

// 描述常是写给 AI 的长触发说明：只取第一句，最多 40 字
export const brief = (d = '') => {
  const s = String(d).split(/[。！？；\n]|\. /)[0].trim();
  return [...s].length > 40 ? [...s].slice(0, 40).join('') + '…' : s;
};

// 命令提示：› <命令>   <原因>
export const hints = (pairs) => table(pairs.map(([cmd, why]) => [`${I.cmd} ${blue(cmd)}`, dim(why)]), { gap: '   ' });

// “怎么办”一行
export const fixLine = (fix) => `  ${I.cmd} ${fix}`;
// 错误：首行 ✖ 红色，其余行（如已带 › 的修复建议）原样
export const error = (msg, ...fixes) => {
  const [head, ...rest] = String(msg).split('\n');
  return [red(`✖ ${head}`), ...rest, ...fixes.map(fixLine)];
};

const TONE = { green, yellow, red };
// 圆角卡片，宽度按显示宽度计算
export function box(title, lines, tone = 'green') {
  const c = TONE[tone] ?? green;
  const inner = Math.max(width(title) + 4, ...lines.map((l) => width(l) + 4));
  return [
    c(`╭─ ${title} ${'─'.repeat(inner - width(title) - 3)}╮`),
    ...lines.map((l) => `${c('│')}  ${pad(l, inner - 2)}${c('│')}`),
    c(`╰${'─'.repeat(inner)}╯`),
  ];
}
