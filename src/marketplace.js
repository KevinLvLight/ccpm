import { PreconditionError, samePath } from './context.js';

const norm = (s) => String(s).trim().replace(/\/+$/, '').replace(/\.git$/, '').toLowerCase();
const looksLikePath = (s) => /^([./~]|[A-Za-z]:[\\/])/.test(s);

// 在 claude plugin marketplace list 的结果里找 source 指的那个：名字、git 地址、GitHub owner/repo 或本地路径
export function findMarketplace(list, source) {
  const s = String(source).trim();
  return list.find((m) => m.name === s)
    ?? list.find((m) => {
      const ids = [m.url, m.repo, m.repo && `https://github.com/${m.repo}`].filter(Boolean).map(norm);
      if (ids.includes(norm(s))) return true;
      return Boolean(m.path && looksLikePath(s) && samePath(m.path, s));
    });
}

export const noMarketplace = (msg) => Object.assign(new PreconditionError(msg, '运行 ccpm use <marketplace 地址>'), { code: 'NO_MARKETPLACE' });

// 这次用哪个 marketplace：--marketplace > ccpm.json 里的 current > 只添加了一个时直接用它
export function resolveMarketplace({ flag, file, list }) {
  if (flag) {
    if (!list.some((m) => m.name === flag)) throw noMarketplace(`Claude Code 里没有叫 ${flag} 的 marketplace`);
    return { name: flag, source: 'flag' };
  }
  if (file.current) {
    if (list.some((m) => m.name === file.current)) return { name: file.current, source: 'state' };
    throw Object.assign(new PreconditionError(`${file.current} 已从 Claude Code 中移除`, `运行 ccpm use <${file.current} 的地址> 重新添加，或 ccpm use 换一个`), { code: 'NO_MARKETPLACE' });
  }
  if (list.length === 1) return { name: list[0].name, source: 'only', note: `正在使用 ${list[0].name}（ccpm use 可以切换）` };
  throw noMarketplace(list.length ? `还没选择要管理的 marketplace（Claude Code 里有 ${list.map((m) => m.name).join('、')}）` : 'Claude Code 里还没有添加任何 marketplace');
}
