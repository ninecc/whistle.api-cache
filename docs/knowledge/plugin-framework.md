# 插件框架基础知识

本文记录本项目采用的 Whistle 插件框架决策。`lack`、hook API、`whistleConfig`、插件 UI、插件加载排障的通用说明以 `skills/whistle-plugin` 为准；本文只保留会影响 `whistle.api-cache` 的项目化结论。

## 与 `skills/whistle-plugin` 的关系

遇到下面问题时，不在本文扩写答案，直接查 `skills/whistle-plugin` 及其 references：

- 初始化插件项目、`lack` 版本、构建产物和导出约定。
- `PluginOptions`、Storage/SharedStorage、request 类型和 header。
- `package.json`、`whistleConfig`、Network 列、菜单、Tab、`hintUrl`、`pluginVars`。
- mock、鉴权、pipe、动态规则、证书、自定义 UI、补全。
- 插件不加载、hook 不触发、UI 空白、发布检查。

## 本项目保留的框架决策

`lack` 是 Whistle 的 plugin 脚手架，本项目只需要保留两个维护事实：

- `lack watch`：开发调试主命令，会把当前插件挂载到 Whistle，代码变更后自动重载，并在终端显示插件进程里的 `console.xxx`。
- 涉及真实 Whistle 进程、全局 npm 包、系统代理或证书时，需要先说明影响并请求授权。

项目规则中的外部资料：

- `lack` 源码地址：`https://github.com/avwo/lack`
- Whistle 插件开发文档：`https://wproxy.org/docs/extensions/dev.html`

## 包名和协议名

本项目使用 `whistle.api-cache`。原因是 Whistle 内置已有 `cache` 协议，不能使用会产生短名冲突的 `whistle.cache`。

规则中建议默认写长协议：

```txt
www.example.com/api whistle.api-cache://auto
```

短协议可能可用，但文档和 UI 文案优先使用长协议，避免和 Whistle 内置 `cache://` 响应头规则混淆。

## 插件项目形态

本项目是 TypeScript 插件，入口由 `src/index.ts` 导出标准 hook：

```ts
export { default as server } from './server';
export { default as resStatsServer } from './resStatsServer';
export { default as rulesServer } from './rulesServer';
export { default as uiServer } from './uiServer';
```

构建后 Whistle 加载的是编译产物。修改 hook 文件后需要构建或通过 `lack watch` 的开发链路验证。TypeScript 导出细节若有疑问，以 `skills/whistle-plugin` 的 scaffold/API reference 为准。

## 插件 UI 基础

`uiServer` 负责本项目插件 UI 页面和 CGI API。插件页面通常嵌在 Whistle Plugins Tab 中，因此前端实现要保持紧凑、克制、易读。

UI 相关注意：

- 静态资源路径要适配插件页面前缀。
- CGI API 返回 JSON，方便前端轮询和操作。
- 插件页面可通过 Whistle 的插件路径访问，例如 `http://localhost:8899/plugin.api-cache/`。

## 本项目的动态规则用法

`rulesServer` 根据当前请求返回规则文本。本项目只依赖下面这些动态规则输出：

- 返回响应状态码：`statusCode://200`
- 返回响应头：`resHeaders://{headersKey}`
- 返回响应体：`resBody://{bodyKey}`
- 注入 Network 高亮：`style://...`

复杂响应体或二进制内容需要谨慎设计表达方式；本项目当前更适合 JSON 和文本响应。不要在本文扩展通用动态规则教程，规则语法以 `skills/whistle` 和 `skills/whistle-plugin` 为准。

## 调试和验证入口

开发时常用命令：

```bash
rtk npm run build
rtk npm test
rtk npm run e2e:auto-replay
```

真实 Whistle 插件调试通常还需要：

```bash
lack watch
```

验证插件行为时至少检查：

- 插件是否在 Whistle Plugins 面板启用。
- Rules 是否匹配目标请求。
- hook 是否触发。
- 插件 UI 静态资源是否能正常加载。
- Network 或诊断事件是否出现预期标记。

## 防劣化规则

- 不把 `skills/whistle-plugin/references` 中的 API 表复制到本文。
- 不新增未验证的 hook 选择建议；普通代理映射、mock、改写优先回到 `skills/whistle` 判断，不为了规则问题扩展本插件。
- 本文只保留本项目已经采用的框架决策；候选方案、历史猜测和未落地实验不要沉淀为“知识”。
- 修改包名、hook 导出、`whistleConfig` 或 UI 入口时，必须同步更新本文、`project-technical.md` 和真实验证步骤。
