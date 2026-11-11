// 网页上用到的文字（按当前语言翻译好再发给浏览器；页面本身不含任何中文）
import { t } from '../i18n/index.js';

export const pageStrings = () => ({
  // 插件装在哪里
  placeIn: t('插件装在'), placeWhere: t('插件装在哪里'), placeLabel: t('装在'),
  allProjects: t('所有项目'), allProjectsLong: t('所有项目（全局）'), allProjectsHint: t('在任何项目里打开 Claude 都能用'),
  projectOnly: t('只装在某个项目里'), otherFolder: t('选择其他文件夹…'), installedN: t('{0} 个'),
  pickFolder: t('选择项目文件夹'), folderPath: t('文件夹路径'), up: t('上一级'), go: t('前往'), useFolder: t('用这个文件夹'),
  // 导航
  installed: t('已安装'), discover: t('发现插件'), bundles: t('插件套装'), markets: t('插件市场'),
  recheck: t('重新检查'), working: t('正在处理…'), checking: t('正在检查更新…'), upToDate: t('已是最新数据'), needsAttention: t('有需要处理的插件'), dryRun: t('预览模式'),
  // 已安装
  installedSub: t('{0} · {1} 个插件'), searchInstalled: t('搜索已安装的插件'), searchAll: t('搜索插件'),
  updatesN: t('{0} 个插件有新版本'), updateAll: t('全部更新'),
  configOne: t('{0} 还缺 {1} 项配置'), configMany: t('{0} 个插件还缺配置'), configHint: t('填好之前，这些插件可能用不了'), fillIn: t('去填写'),
  depsN: t('{0} 个插件缺少依赖'), fixDeps: t('补装依赖'),
  inThisProject: t('这个项目里的'), globalAlso: t('全局安装的'), globalAlsoHint: t('在这个项目里也能用'),
  emptyInstalled: t('这里还没有安装插件'), emptyInstalledHint: t('到“发现插件”里看看有什么可以装'),
  emptyProject: t('这个项目还没有单独安装插件'), emptyProjectHint: t('只想在这个项目里用的插件，可以装在这里'),
  noMatch: t('没有匹配的插件'),
  sUpdate: t('有新版本'), sConfig: t('缺配置'), sDeps: t('缺依赖'), sOff: t('已停用'), sRemoved: t('已下架'),
  // 操作
  install: t('安装'), installHere: t('也装到这个项目'), update: t('更新'), fillConfig: t('填写配置'), changeConfig: t('修改配置'),
  enable: t('启用'), disable: t('停用'), remove: t('卸载'), details: t('查看详情'), more: t('更多操作'),
  // 发现插件
  discoverSub: t('{0} 个插件可以安装 · 来自 {1} 个插件市场'), all: t('全部'), emptyDiscover: t('所有插件都已经装上了'),
  // 插件套装
  bundlesSub: t('一组搭配好的插件，一次装齐'), bundleChosen: t('已选用'), viaBundle: t('包含在套装 {0} 里'),
  bundleProgress: t('已装 {0}/{1}'), installBundle: t('装齐'), removeBundle: t('卸载套装'), includesBundle: t('含 {0} 全部'), removedByYou: t('你卸掉的'),
  bundlesGlobalOnly: t('插件套装只能装到所有项目'), switchToAll: t('切到所有项目'),
  emptyBundles: t('这些插件市场没有提供套装'), emptyBundlesHint: t('插件市场作者可以在 presets.json 里定义套装'),
  // 插件市场
  marketsSub: t('插件都从这些插件市场安装'), addMarket: t('添加插件市场'), mInstalled: t('已装'), mTotal: t('插件'),
  marketError: t('读取失败：{0}'), emptyMarkets: t('还没有添加插件市场'), emptyMarketsHint: t('添加一个插件市场，就能浏览和安装里面的插件'),
  source: t('插件市场地址'), sourceHint: t('GitHub owner/repo、git 地址或本地路径'), sourceRequired: t('先填写地址'), add: t('添加'),
  // 详情
  from: t('来自'), versionInstalled: t('已装版本'), versionLatest: t('最新版本'), dependsOn: t('依赖'), notInstalled: t('还没装'),
  updateCallout: t('有新版本 {0}，更新后重启 Claude Code 生效'), configCallout: t('还缺这些配置：{0}'), depsCallout: t('缺少依赖：{0}'),
  globalReadonly: t('这个插件装在全局，所有项目都能用；要在这里管理它，先切到“所有项目”'),
  // 进度和对话框
  running: t('正在执行…'), showLog: t('详情'), hideLog: t('收起'), close: t('关闭'), cancel: t('取消'),
  confirm: t('确认'), yes: t('确认'), no: t('取消'), choose: t('请选择'), fill: t('请填写'), ok: t('确定'), skip: t('跳过'),
  secretHint: t('输入内容已隐藏'), defaultHint: t('直接回车使用 {0}'),
  disconnected: t('与 ccpm 的连接已断开：回到终端重新运行 ccpm web'),
});
