# Changelog

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
