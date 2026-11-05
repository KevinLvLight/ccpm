import { t } from '../i18n/index.js';
import { GIT_AUTH, GIT_HINT, NET_HINT, PreconditionError } from '../context.js';
import { findMarketplace } from '../marketplace.js';
import { loadFile, setCurrent } from '../state.js';
import { loadCatalog } from '../catalog.js';
import { loadPresets } from '../presets.js';
import { join } from 'node:path';
import { I, bold, dim, error, hints } from '../ui.js';

// ccpm use [source]：选定要管理的 marketplace（没添加过就先添加），记到 ccpm.json
// ctx：{ claude, prompter, out, progress?, stateFile? }
export async function run(ctx, [source] = [], flags = {}) {
  const { claude, out, prompter } = ctx;
  const file = loadFile(ctx.stateFile, { readOnly: true });
  if (flags.show) {
    out(file.current ? t('当前：{0}', bold(file.current)) : dim(t('还没选择 marketplace，运行 ccpm use <marketplace 地址>')));
    return 0;
  }
  const cap = await claude.checkCapabilities();
  if (!cap.ok) {
    throw cap.missing.includes('claude')
      ? new PreconditionError(t('未找到 claude 命令'), t('安装 Claude Code 后，重新打开命令行窗口再试'))
      : new PreconditionError(t('Claude Code 版本太旧，请升级 Claude Code'), t('运行 claude update'));
  }
  let list = await claude.listMarketplaces();
  let target;
  if (!source) {
    if (!list.length) {
      error(t('Claude Code 里还没有添加任何 marketplace'), t('运行 ccpm use <marketplace 地址>，例如 ccpm use owner/repo')).forEach(out);
      return 1;
    }
    if (prompter.interactive === false) {
      error(t('请指定要用的 marketplace'), t('运行 ccpm use <名字>，可选：{0}', list.map((m) => m.name).join(t('、')))).forEach(out);
      return 1;
    }
    const names = list.map((m) => m.name);
    const picked = await prompter.choose(t('要管理哪个 marketplace？'), names);
    target = list.find((m) => m.name === picked);
  } else {
    target = findMarketplace(list, source);
    if (!target) {
      const before = new Set(list.map((m) => m.name));
      const add = () => claude.addMarketplace(source);
      try {
        await (ctx.progress ? ctx.progress.step(t('正在添加 marketplace {0}', source), add) : add());
      } catch (e) {
        list = await claude.listMarketplaces().catch(() => list);
        target = findMarketplace(list, source); // 有的版本对已添加的会报错：以列表为准
        if (!target) throw new PreconditionError(t('无法添加 marketplace {0}: {1}', source, e.brief ?? e.message), GIT_AUTH.test(e.message) ? GIT_HINT() : NET_HINT());
      }
      if (!target) {
        list = await claude.listMarketplaces();
        target = list.find((m) => !before.has(m.name)) ?? findMarketplace(list, source);
      }
      if (!target) throw new PreconditionError(t('添加后没有找到 marketplace {0}', source), t('运行 claude plugin marketplace list 查看'));
    }
  }

  setCurrent(target.name, ctx.stateFile);
  let count = '';
  try {
    const n = loadCatalog(target.installLocation, () => {}).size;
    const { presets } = loadPresets(join(target.installLocation, 'presets.json'));
    const p = Object.keys(presets).length;
    count = t(' · {0} 个插件{1}', n, p ? t(' · {0} 个预设', p) : '');
  } catch {}
  out(t('{0} 已切换到 {1}{2}', I.ok, bold(target.name), dim(count)));
  hints([['ccpm', t('打开交互界面')], ['ccpm status', t('查看状态')]]).forEach(out);
  return 0;
}
