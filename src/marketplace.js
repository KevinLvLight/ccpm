import { t } from './i18n/index.js';
import { PreconditionError, samePath } from './context.js';

// 同一个仓库的不同写法归一成 host/owner/repo：https://、git@host:、末尾 .git 和 / 都去掉；owner/repo 视为 GitHub
const norm = (s) => {
  let v = String(s).trim().toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\/([^/@]*@)?/, '').replace(/^[^/@\s]+@([^:/]+):/, '$1/');
  return /^[^/.:]+\/[^/]+$/.test(v) ? `github.com/${v}` : v;
};
export const looksLikePath = (s) => /^([./~]|[A-Za-z]:[\\/]|\\\\)/.test(s);

// 在 claude plugin marketplace list 的结果里找 source 指的那个：名字、git 地址、GitHub owner/repo 或本地路径
export function findMarketplace(list, source) {
  const s = String(source).trim();
  return list.find((m) => m.name === s)
    ?? list.find((m) => {
      const ids = [m.url, m.repo].filter(Boolean).map(norm);
      if (ids.includes(norm(s))) return true;
      return Boolean(m.path && looksLikePath(s) && samePath(m.path, s));
    });
}

export const noMarketplace = (msg) => Object.assign(new PreconditionError(msg, t('运行 ccpm use <marketplace 地址>')), { code: 'NO_MARKETPLACE' });

// 这次用哪个 marketplace：--marketplace > ccpm.json 里的 current > 只添加了一个时直接用它
export function resolveMarketplace({ flag, file, list }) {
  if (flag) {
    if (!list.some((m) => m.name === flag)) throw noMarketplace(t('Claude Code 里没有叫 {0} 的 marketplace', flag));
    return { name: flag, source: 'flag' };
  }
  if (file.current) {
    if (list.some((m) => m.name === file.current)) return { name: file.current, source: 'state' };
    throw Object.assign(new PreconditionError(t('{0} 已从 Claude Code 中移除', file.current), t('运行 ccpm use <{0} 的地址> 重新添加，或 ccpm use 换一个', file.current)), { code: 'NO_MARKETPLACE' });
  }
  if (list.length === 1) return { name: list[0].name, source: 'only', note: t('正在使用 {0}（ccpm use 可以切换）', list[0].name) };
  throw noMarketplace(list.length ? t('还没选择要管理的 marketplace（Claude Code 里有 {0}）', list.map((m) => m.name).join(t('、'))) : t('Claude Code 里还没有添加任何 marketplace'));
}
