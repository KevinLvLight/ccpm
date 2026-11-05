import { t } from '../i18n/index.js';
import { MARKETPLACE } from '../claude.js';
// 交互界面的纯函数部分：render(state, 尺寸) → 每行文字；reduce(state, 按键) → { state, effect }
import { counterCells, memberText, pluginCells, pluginNotes, presetCells } from '../render.js';
import { SECRET_HINT } from '../prompt.js';
import { I, bold, box, brief, dim, inverse, pad, truncate, width, yellow } from '../ui.js';

export const KEYS = () => t('↑↓ 移动  空格 勾选  i 安装  u 更新  c 配置  e 启用/停用  r 卸载  s 同步  p 全局/项目  R 重新扫描  ? 帮助  q 退出');
const KEYS_SHORT = () => t('i 安装 u 更新 c 配置 e 启停 r 卸载 s 同步 p 范围 R 重扫 ? 帮助 q 退出'); // 窄窗口
const VERB = () => ({ install: t('安装'), update: t('更新'), config: t('配置'), enable: t('启用'), disable: t('停用'), remove: t('卸载'), sync: t('同步') });
const PAGE = 10;

// 操作的标题，例如“安装 data”
export const runTitle = ({ cmd, names }) => [VERB()[cmd], ...(names.length ? names : cmd === 'update' ? [t('全部')] : [])].join(' ');

export const initialState = ({ scope = 'user', dryRun = false } = {}) => ({
  model: null, scope, dryRun,
  cursor: null, // 光标所在项的名字（刷新后仍停在同一项）
  selected: [], // 勾选的名字
  overlay: null, // 'help'
  dialog: null, // { kind: 'confirm'|'choose'|'ask', ... }
  log: null, // { title, lines, running }
  spinner: '',
  message: '',
  busy: false,
});

// 列表：分组标题 { head } 和条目 { kind, name, p }
export function itemsOf(model) {
  if (!model) return [];
  const user = model.scope !== 'project';
  const out = [];
  const section = (head, sub, list) => { if (list.length) out.push({ head, sub }, ...list); };
  const of = (where) => model.plugins.filter((p) => p.where === where).map((p) => ({ kind: 'plugin', name: p.name, p }));
  if (user) section(t('预设'), t('一组常用插件'), model.presets.map((p) => ({ kind: 'preset', name: p.name, p })));
  section(user ? t('已安装') : t('本项目安装的'), '', of('here'));
  section(t('全局安装的'), t('本项目也能用'), of('global'));
  section(t('还没装的'), t('可选，按需安装'), of('none'));
  return out;
}

const cursorIndex = (items, name) => {
  const i = items.findIndex((x) => !x.head && x.name === name);
  return i >= 0 ? i : items.findIndex((x) => !x.head);
};

// ---------- render ----------

const cellsOf = (x) => {
  const p = x.p;
  if (x.kind === 'preset') return presetCells(p);
  if (p.where === 'here') return pluginCells(p);
  if (p.where === 'global') return [dim(`${I.ok} ${p.name}`), dim(p.version ?? ''), dim(t('装在全局'))];
  return [`${I.none} ${dim(p.name)}`, dim(p.latest ?? ''), dim(brief(p.description))];
};

// 带颜色的小块按显示宽度排成多行
const flow = (parts, w, indent) => {
  const out = [];
  let cur = indent;
  for (const s of parts) {
    if (cur.trim() && width(`${cur}  ${s}`) > w) { out.push(cur); cur = indent; }
    cur += cur.trim() ? `  ${s}` : s;
  }
  if (cur.trim()) out.push(cur);
  return out;
};
// 纯文字折行并缩进
const para = (s, w, indent = '  ', color = (t) => t) => (s ? wrap(s, w - width(indent)).map((l) => indent + color(l)) : []);

// 光标所在项的详情：完整描述、版本、依赖、预设成员，按窗口宽度折行
function detail(x, W = 80) {
  if (!x) return [];
  const p = x.p;
  if (x.kind === 'preset') {
    const want = p.members.filter((m) => m.kind !== 'preset');
    return [
      `${bold(p.name)}  ${dim(t('{0} · 已装 {1}/{2}', p.chosen || p.via ? t('已选') : t('未选'), p.got, p.want))}`,
      ...para(p.description, W),
      `  ${dim(want.length < p.members.length ? t('包含：') : t('包含 {0} 个插件：', want.length))}`,
      ...flow(p.members.map(memberText), W, '    '),
      dim(t('  i 装齐整个预设 · r 卸掉整个预设')),
    ];
  }
  const ver = p.where === 'none' ? t('最新 {0}', p.latest ?? '-')
    : t('已装 {0}{1}', p.version ?? '-', p.latest && p.latest !== p.version ? t(' · 最新 {0}', p.latest) : '');
  const deps = p.dependencies.length ? t(' · 依赖 {0}', p.dependencies.join(t('、'))) : '';
  const notes = pluginNotes(p);
  const last = p.where === 'global' ? dim(t('  装在全局，本项目也能用；按 i 可以再装一份到本项目'))
    : p.where === 'none' ? dim(t('  按 i 安装，依赖会一起装'))
      : notes.length ? `  ${notes.join(' · ')}` : dim(t('  一切正常{0}', p.hasConfig ? t(' · c 修改配置') : ''));
  return [`${bold(p.name)}  ${dim(`${ver}${deps}`)}`, ...para(p.description, W), last];
}

// 按显示宽度折行（纯文字，不含颜色码）
function wrap(s, w) {
  const out = [];
  for (const para of String(s).split('\n')) {
    let cur = '';
    for (const ch of para) {
      if (width(cur + ch) > w) { out.push(cur); cur = ''; }
      cur += ch;
    }
    out.push(cur);
  }
  return out;
}

// 只保留末尾能放下的部分（输入很长时）
const tail = (s, w) => {
  let out = '';
  for (const ch of [...s].reverse()) {
    if (width(ch + out) > w) return `…${out}`;
    out = ch + out;
  }
  return out;
};

function dialogBox(d, cols) {
  const w = Math.max(20, Math.min(64, cols - 8));
  if (d.kind === 'confirm') {
    return box(t('确认'), [...wrap(d.title, w).map(bold), '', `${d.def ? '(Y/n)' : '(y/N)'}  ${dim(t('y 是 · n 否 · 回车 = 默认 · Esc = 否'))}`], 'yellow');
  }
  if (d.kind === 'choose') {
    const opts = d.options.map((o, i) => (i === d.index ? inverse(`▸ ${o}`) : `  ${o}`));
    return box(t('请选择'), [...wrap(d.title, w).map(bold), '', ...opts, '', dim(t('↑↓ 选择 · 回车确认'))], 'yellow');
  }
  const tips = [d.secret && SECRET_HINT(), d.hint, d.def !== undefined && t('直接回车使用 {0}', d.def)].filter(Boolean).join(' · ');
  const shown = d.secret ? '•'.repeat([...d.text].length) : d.text;
  return box(t('请填写'), [
    ...wrap(d.title, w).map(bold),
    ...(tips ? wrap(tips, w).map(dim) : []),
    '',
    `${I.cmd} ${tail(shown, w - 4)}${inverse(' ')}`,
    '',
    dim(t('回车确认 · Esc 跳过')),
  ], 'yellow');
}

const HELP = () => [
  t('↑↓ / j k   移动        PgUp PgDn Home End  翻页'),
  t('空格       勾选        a  取消全部勾选'),
  t('i  安装插件或预设，依赖会一起装'),
  t('u  更新（光标处没有可更新的插件时 = 全部更新）'),
  t('c  重新填写配置'),
  t('e  启用 / 停用'),
  t('r  卸载插件或整个预设'),
  t('s  同步：补装、更新、补配置'),
  t('p  切换 全局 / 本项目'),
  t('R  重新扫描（重新拉取插件列表）'),
  t('q  退出    Esc  关闭弹窗'),
  '',
  t('操作对象：勾选的项；没有勾选时是光标所在的项'),
  t('图例：✔ 正常  ↑ 可更新  ▲ 需要处理  ⏸ 已停用  ○ 未安装  [x] 已勾选'),
  '',
];

export function render(state, { cols = 80, rows = 24 } = {}) {
  const W = Math.max(10, cols - 1); // 最后一列不写，避免个别终端自动换行
  const m = state.model;
  const items = itemsOf(m);
  const ci = cursorIndex(items, state.cursor);
  // 详情区按内容最多的一项定高（不随光标跳动），最多占一半
  const half = Math.max(3, Math.floor((rows - 5) / 2));
  const panel = state.log ? Math.max(6, half) : Math.min(half, Math.max(3, ...items.map((x) => (x.head ? 0 : detail(x, W).length))));
  const listH = Math.max(1, rows - 5 - panel);
  const rule = (txt) => dim(txt ? `── ${txt} ${'─'.repeat(Math.max(0, W - width(txt) - 4))}` : '─'.repeat(W));
  const lines = [];

  const left = `${bold('ccpm')} · ${MARKETPLACE} · ${state.scope === 'project' ? t('本项目') : t('全局')}${state.dryRun ? ` · ${yellow(t('预览模式，不做改动'))}` : ''}`;
  const right = m ? counterCells(m).join('  ') : '';
  const gap = W - width(left) - width(right);
  lines.push(left + ' '.repeat(Math.max(2, gap)) + right);
  lines.push(rule());

  // 列表：同类条目按列对齐；光标居中滚动
  const cells = items.map((x) => (x.head ? null : cellsOf(x)));
  const colW = {};
  items.forEach((x, i) => {
    if (x.head) return;
    const k = x.kind === 'preset' ? 'preset' : 'plugin';
    colW[k] ??= [0, 0];
    colW[k] = [Math.max(colW[k][0], width(cells[i][0])), Math.max(colW[k][1], width(cells[i][1]))];
  });
  const top = Math.max(0, Math.min(ci - Math.floor(listH / 2), items.length - listH));
  for (let i = top; i < Math.min(items.length, top + listH); i++) {
    const x = items[i];
    if (x.head) {
      lines.push(` ${bold(x.head)}${x.sub ? `  ${dim(x.sub)}` : ''}`);
      continue;
    }
    const [w0, w1] = colW[x.kind === 'preset' ? 'preset' : 'plugin'];
    const [c0, c1, c2] = cells[i];
    const text = `${i === ci ? '▸' : ' '}${state.selected.includes(x.name) ? '[x]' : '   '} ${pad(c0, w0)}  ${pad(c1, w1)}  ${c2}`.trimEnd();
    lines.push(i === ci ? inverse(pad(truncate(text, W), W)) : text);
  }
  if (!items.length) lines.push(dim(m ? t('  {0} 里还没有插件', MARKETPLACE) : state.busy ? t('  正在读取插件列表…') : t('  没有读到插件列表，按 R 重新扫描')));
  while (lines.length < 2 + listH) lines.push('');

  const below = items.length - top - listH;
  if (state.log) {
    lines.push(rule(state.log.title));
    const body = [...state.log.lines, ...(state.log.running && state.spinner ? [state.spinner] : [])].slice(-panel);
    lines.push(...body, ...Array(panel - body.length).fill(''));
  } else {
    lines.push(rule(items.length > listH ? `${top + 1}-${top + listH} / ${items.length}${below > 0 ? t(' · 下面还有') : ''}` : ''));
    const d = detail(items[ci], W).slice(0, panel);
    lines.push(...d, ...Array(panel - d.length).fill(''));
  }
  lines.push(` ${state.message}`);
  lines.push(dim(` ${width(KEYS()) < W ? KEYS() : KEYS_SHORT()}`));

  const out = lines.slice(0, rows).map((l) => truncate(l, W));
  while (out.length < rows) out.push('');
  const over = state.dialog ? dialogBox(state.dialog, cols) : state.overlay === 'help' ? box(t('帮助'), [...HELP(), dim(t('按 Esc 或 ? 关闭'))]) : null;
  if (over) {
    // 有操作记录时弹窗放在列表区，不挡住“将要执行”等内容
    const t = state.log && over.length <= listH ? 2 + Math.floor((listH - over.length) / 2) : Math.max(0, Math.floor((rows - over.length) / 2));
    const l = ' '.repeat(Math.max(0, Math.floor((W - width(over[0])) / 2)));
    over.forEach((x, i) => { if (t + i < rows) out[t + i] = truncate(l + x, W); });
  }
  return out;
}

// ---------- reduce ----------

// 按键：{ name, ch, ctrl, meta }（readline keypress）→ 统一的键名
const keyId = (k) => (k.ctrl && k.name === 'c' ? 'C-c'
  : k.name === 'enter' ? 'return'
    : k.name && k.name.length > 1 ? k.name : k.ch ?? k.name);

const note = (state, message) => ({ state: { ...state, message } });

function dialogKey(s, id, key) {
  const d = s.dialog;
  const answer = (value) => ({ state: { ...s, dialog: null }, effect: { type: 'answer', value } });
  const set = (o) => ({ state: { ...s, dialog: { ...d, ...o } } });
  if (d.kind === 'confirm') {
    if (/^[yY]$/.test(id)) return answer(true);
    if (/^[nN]$/.test(id) || id === 'escape') return answer(false);
    if (id === 'return') return answer(d.def);
    return { state: s };
  }
  if (d.kind === 'choose') {
    const n = d.options.length;
    if (id === 'up' || id === 'k') return set({ index: (d.index + n - 1) % n });
    if (id === 'down' || id === 'j') return set({ index: (d.index + 1) % n });
    if (id === 'return') return answer(d.options[d.index]);
    if (id === 'escape' && 'cancel' in d) return answer(d.cancel); // 可取消的选择框
    return { state: s };
  }
  if (id === 'return') return answer(d.text);
  if (id === 'escape') return answer(''); // 跳过：按“留空”处理
  if (id === 'backspace') return set({ text: [...d.text].slice(0, -1).join('') });
  // eslint-disable-next-line no-control-regex
  const typed = !key.ctrl && !key.meta && !String(key.ch ?? '').startsWith('\x1b') ? String(key.ch ?? '').replace(/[\x00-\x1f\x7f]/g, '') : '';
  return typed ? set({ text: d.text + typed }) : { state: s }; // 粘贴时一次可能来多个字符
}

// 按键不适用于这一项时的说明
const why = (x) => (!x ? t('这里没有插件')
  : x.kind === 'preset' ? t('{0} 是预设，只能安装（i）或卸载（r）', x.name)
    : x.p.where === 'global' ? t('{0} 装在全局，按 p 切到全局再操作', x.name)
      : x.p.where === 'none' ? t('{0} 还没装，按 i 安装', x.name) : null);

function action(s, id) {
  if (!s.model) return note(s, t('还没有读到插件列表，按 R 重新扫描'));
  const items = itemsOf(s.model);
  const cur = items[cursorIndex(items, s.cursor)];
  const picked = s.selected.length ? items.filter((x) => !x.head && s.selected.includes(x.name)) : cur ? [cur] : [];
  const here = picked.filter((x) => x.kind === 'plugin' && x.p.where === 'here');
  const run = (cmd, list) => ({ state: s, effect: { type: 'run', cmd, names: list.map((x) => x.name) } });
  const user = s.model.scope !== 'project';
  switch (id) {
    case 'i': {
      const list = picked.filter((x) => (x.kind === 'preset' ? user : x.p.where !== 'here'));
      return list.length ? run('install', list) : note(s, picked.length > 1 ? t('勾选的都已经装好了') : t('{0} 已经装好了', picked[0]?.name ?? t('这一项')));
    }
    case 'u': {
      if (s.selected.length) {
        const list = here.filter((x) => x.p.update);
        return list.length ? run('update', list) : note(s, why(picked.find((x) => why(x))) ?? t('勾选的插件都已是最新'));
      }
      if (cur?.p?.update) return run('update', [cur]);
      return s.model.counters.update ? run('update', []) : note(s, t('没有可更新的插件'));
    }
    case 'c': {
      if (picked.length > 1) return note(s, t('一次只能配置一个插件，先按 a 取消勾选'));
      const x = picked[0];
      if (why(x)) return note(s, why(x));
      return x.p.hasConfig ? run('config', [x]) : note(s, t('{0} 没有需要填写的配置', x.name));
    }
    case 'e': {
      if (!here.length) return note(s, why(picked[0]) ?? t('没有可启用 / 停用的插件'));
      const off = here.filter((x) => !x.p.enabled);
      return off.length ? run('enable', off) : run('disable', here);
    }
    case 'r': {
      const list = picked.filter((x) => x.kind === 'preset' || x.p.where === 'here');
      return list.length ? run('remove', list) : note(s, why(picked[0]) ?? t('没有可卸载的插件'));
    }
    default:
      return { state: s };
  }
}

export function reduce(state, key) {
  const id = keyId(key);
  if (id === 'C-c') return { state, effect: { type: 'quit', force: true } };
  if (state.dialog) return dialogKey(state, id, key);
  if (state.overlay) return { state: ['escape', '?', 'q'].includes(id) ? { ...state, overlay: null } : state };
  if (state.busy) return note(state, t('正在执行，请稍候（Ctrl+C 强制退出）'));
  let s = { ...state, message: '' };
  if (s.log && s.model) { // 上一次操作的记录留到按下一个键（没读到列表时一直留着报错）
    s = { ...s, log: null };
    if (id === 'escape') return { state: s };
  }
  const items = itemsOf(s.model);
  const sel = items.map((x, i) => (x.head ? -1 : i)).filter((i) => i >= 0);
  const move = (d) => {
    if (!sel.length) return { state: s };
    const pos = Math.max(0, Math.min(sel.length - 1, sel.indexOf(cursorIndex(items, s.cursor)) + d));
    return { state: { ...s, cursor: items[sel[pos]].name } };
  };
  switch (id) {
    case 'up': case 'k': return move(-1);
    case 'down': case 'j': return move(1);
    case 'pageup': return move(-PAGE);
    case 'pagedown': return move(PAGE);
    case 'home': return move(-Infinity);
    case 'end': return move(Infinity);
    case 'space': {
      const x = items[cursorIndex(items, s.cursor)];
      if (!x) return { state: s };
      const selected = s.selected.includes(x.name) ? s.selected.filter((n) => n !== x.name) : [...s.selected, x.name];
      return { state: { ...s, selected } };
    }
    case 'a': return { state: { ...s, selected: [] } };
    case '?': return { state: { ...s, overlay: 'help' } };
    case 'q': case 'escape': return { state: s, effect: { type: 'quit' } };
    case 'p': return s.model ? { state: s, effect: { type: 'scope' } } : note(s, t('还没有读到插件列表，按 R 重新扫描'));
    case 'R': return { state: s, effect: { type: 'rescan' } };
    case 's': return { state: s, effect: { type: 'run', cmd: 'sync', names: [] } };
    case 'i': case 'u': case 'c': case 'e': case 'r': return action(s, id);
    default: return id && id.length === 1 ? note(s, t('{0} 没有对应的操作，按 ? 查看帮助', id)) : { state: s };
  }
}
