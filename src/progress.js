import { t } from './i18n/index.js';
import { blue, dim, green, red, yellow } from './ui.js';

const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const GAP = '      ';
const secs = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

// animate=true：单行转圈（\r 重写）；否则不转圈，只打结果行。
// prep=true：准备阶段——各步只换转圈的标签，不打结果行；ready() 时打一行“准备就绪”。
export function createProgress({ out, stream = process.stdout, animate = false, prep = false }) {
  const born = Date.now();
  const active = [];
  let timer = null;
  let i = 0;
  let prepping = prep;
  const summary = { text: '', warn: false };
  const notes = [];

  const draw = () => stream.write(`\r\x1b[K${blue(FRAMES[i++ % FRAMES.length])} ${active.at(-1)}`);
  const pause = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    stream.write('\r\x1b[K');
  };
  const resume = () => {
    draw();
    timer = setInterval(draw, 80);
    timer.unref?.();
  };
  // 结果行一律走 out（out 负责写日志）；转圈时先擦掉转圈行，写完再接着转
  const print = (line) => {
    pause();
    out(line);
    if (animate && active.length) resume();
  };
  const drop = (label) => {
    active.splice(active.indexOf(label), 1);
    if (!active.length) pause();
  };

  return {
    pause,
    summary,
    // 准备就绪后紧跟着打印的提示行
    note: (line) => notes.push(line),
    ready() {
      if (!prepping) return;
      prepping = false;
      pause();
      const tail = summary.text ? `  ${summary.text}${GAP}${secs(born)}` : `${GAP}${secs(born)}`;
      print(t('{0} 准备就绪{1}', summary.warn ? yellow('▲') : green('✔'), dim(tail)));
      notes.splice(0).forEach(print);
    },
    async step(label, fn, { done = label, fail = label, detail } = {}) {
      const t0 = Date.now();
      active.push(label);
      if (animate && !timer) resume();
      try {
        const r = await fn();
        drop(label);
        if (!prepping) print(`${green('✔')} ${done}${dim(`${detail ? `  ${detail}` : ''}${GAP}${secs(t0)}`)}`);
        return r;
      } catch (e) {
        drop(label);
        if (prepping) {
          prepping = false;
          print(red(`✖ ${label}`));
        } else print(`${red('✖')} ${fail}${e?.brief ? `  ${dim(e.brief)}` : ''}`);
        throw e;
      }
    },
  };
}
