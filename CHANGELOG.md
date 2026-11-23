# Changelog

## [0.3.0] - 2026-11-23

- Web 为主：直接运行 `ccpm` 打开本地 Web 管理器；命令行保留 `status` / `list` / `use` / `check` / `log` / `help` 等查询与维护命令，插件变更全部在 Web 中确认执行。
- 移除 TUI 终端界面及其测试、截图。
- Web 新增删除 marketplace：确认后执行 `claude plugin marketplace remove`，对话框列出将被卸载的插件。
- 新增 `ccpm upgrade`：查询 npm 并更新管理器自身。
- 新增 `ccpm cc-update [version] [--tries N]`：安全更新 Claude Code 本体，候选版本验证失败自动装回原版本；与管理器自更新相互独立。
- Web 新增更新中心，提供两个更新入口并展示执行过程；侧栏显示管理器版本。
- 页面改为书信风格；品牌名 Claude Code Plugin Manager，四个词首字母着色。
- 宽屏下主内容区占满可用宽度；插件套装可点开详情，查看成员与安装状态；修复移动端布局与对话框溢出。

## [0.2.1] - 2026-11-16

- 修复 Windows 上部分插件市场将插件 `source` 写为对象时，`ccpm web` 无法打开的问题。
- 兼容 `source.path` 和 `source.source` 两种路径写法；无法识别的来源仅跳过该插件，不再影响其他插件和网页加载。

## [0.2.0] - 2026-11-16

- 新增 `ccpm web`：在本机浏览器里安装、配置、更新、启停和卸载插件，支持中文和英文界面。
- 支持管理多个插件市场，以及在全局和指定项目文件夹之间切换安装位置。
- 插件市场详情展示来源和安装数量，并提供插件列表、插件套装两个标签页。
- 插件详情展示组件内容、token 占用和更新说明，支持分组版本与 Unreleased 日志；缺少更新说明时提供 GitHub 提交记录链接。
- 先展示本地插件数据，再在后台检查更新，减少首次打开页面的等待。
- 本机服务仅监听 127.0.0.1，校验访问令牌、Host 和 Origin；敏感配置通过标准输入传递，不写入命令参数或日志。

## [0.1.1]

- 修复 Windows 上交互界面按 q 退出后卡住的问题

## [0.1.0]

- Initial release: `ccpm use`, interactive view, presets, settings, updates, `ccpm check`, Chinese / English UI.
