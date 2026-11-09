// 网页上用到的文字（按当前语言翻译好再发给浏览器；页面本身不含任何中文）
import { t } from '../i18n/index.js';

export const pageStrings = () => ({
  user: t('全局'), project: t('本项目'), dryRun: t('预览模式，不做改动'),
  rescan: t('重新扫描'), sync: t('同步'), updateAll: t('全部更新'), search: t('搜索插件'),
  presets: t('预设'), presetsSub: t('一组常用插件'),
  installed: t('已安装'), installedHere: t('本项目安装的'), global: t('全局安装的'), globalSub: t('本项目也能用'),
  notInstalled: t('还没装的'), notInstalledSub: t('可选，按需安装'), noMatch: t('没有匹配的插件'),
  install: t('安装'), update: t('更新'), config: t('配置'), enable: t('启用'), disable: t('停用'), remove: t('卸载'),
  installPreset: t('装齐'), chosen: t('已选'), via: t('已选（{0} 包含）'), notChosen: t('未选'), complete: t('已装齐'),
  missingN: t('缺 {0} 个'), gotOf: t('已装 {0}/{1}'), allOf: t('含 {0} 全部'), removedByYou: t('你卸掉的'), delisted: t('（已下架）'),
  latest: t('最新 {0}'), dependsOn: t('依赖'), installedGlobally: t('装在全局'),
  cInstalled: t('已装'), cUpdate: t('可更新'), cConfigure: t('需配置'), cDisabled: t('已停用'), cNone: t('未装'),
  selected: t('已选 {0} 项'), clear: t('取消勾选'),
  close: t('关闭'), running: t('正在执行…'), issues: t('需要注意'), next: t('下一步'),
  confirm: t('确认'), yes: t('是'), no: t('否'), choose: t('请选择'), fill: t('请填写'), ok: t('确定'), skip: t('跳过'),
  secretHint: t('输入内容已隐藏'), defaultHint: t('直接回车使用 {0}'),
  pick: t('要管理哪个 marketplace？'), source: t('marketplace 地址'), sourceHint: t('GitHub owner/repo、git 地址或本地路径'), use: t('使用'),
  empty: t('{0} 里还没有插件'), loading: t('正在读取插件列表…'),
  disconnected: t('与 ccpm 的连接已断开：回到终端重新运行 ccpm web'),
});
