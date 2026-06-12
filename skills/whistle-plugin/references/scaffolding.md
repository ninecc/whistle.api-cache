# Scaffolding and Trigger Syntax

## 初始化骨架

```bash
npm i -g lack
mkdir whistle.my-plugin
cd whistle.my-plugin
lack init ts,rulesserver,uiserver
npm i
npm run dev
lack watch
```

`lack watch` 会把当前插件挂载到 Whistle，代码变更后自动重载，并把插件进程里的 `console.xxx` 输出到终端。

## lack init 快捷名

- 项目类型：`ts` / `typescript`、`js` / `javascript`
- 规则文件：`rules` / `rules.txt`、`_rules` / `_rules.txt` / `reqrules` / `reqrules.txt`、`resrules` / `resrules.txt`
- 空插件：`blank` / `empty` / `none`
- 常规 hook：`auth` / `verify`、`sni` / `snicallback`、`rulesserver`、`resrulesserver`、`tunnelrulesserver`、`statsserver`、`resstatsserver`、`server`、`uiserver`
- pipe 组合：`pipe`、`pipehttp` / `httppipe`、`pipews` / `wspipe`、`pipetunnel` / `tunnelpipe`
- pipe 细粒度：`reqread`、`reqwrite`、`resread`、`reswrite`、`wsreqread`、`wsreqwrite`、`wsresread`、`wsreswrite`、`tunnelreqread`、`tunnelreqwrite`、`tunnelresread`、`tunnelreswrite`

源码里的 `lack init` 解析会把逗号、点、下划线等分隔符拆开，因此 `lack init ts,rulesserver,uiserver`、`lack init pipeTunnel.server` 这类写法都可用。生成命令时优先使用全小写快捷名，避免大小写混淆。

## package.json 和导出

```json
{
  "name": "whistle.my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "whistleConfig": {}
}
```

TypeScript 项目通常是 `src/*.ts` 编译到 `dist/`，`index.js` 导出 `.default`：

```js
exports.rulesServer = require('./dist/rulesServer').default;
exports.uiServer = require('./dist/uiServer').default;
```

JavaScript 项目通常直接导出：

```js
exports.rulesServer = require('./lib/rulesServer');
```

验证 TS 导出：

```bash
node -e "const m = require('./dist/rulesServer'); console.log(typeof m.default)"
```

输出应为 `function`。

## 触发插件的 Rules

```txt
www.example.com whistle.my-plugin://value
www.example.com my-plugin://value
www.example.com sniCallback://my-plugin(sniValue)
www.example.com pipe://my-plugin(pipeValue)
```

变量和值引用：

```txt
%my-plugin=dev
%my-plugin.env=dev
$my-plugin/key
$whistle.my-plugin/key
```

`%plugin=value` / `%plugin.key=value` 是插件变量赋值；`$plugin/key` 是 Whistle Values 引用，不是插件专属变量语法。

## 静态规则文件

| 文件 | 触发范围 | 阶段 | 注意 |
|---|---|---|---|
| `rules.txt` | 插件安装/启用后自动加载 | 请求阶段 | 优先级低于界面 Rules；插件禁用即失效 |
| `_rules.txt` | 仅命中 `whistle.my-plugin://...` 或 `my-plugin://...` 的请求 | 请求阶段 | 适合插件协议的固定请求规则 |
| `resRules.txt` | 仅命中插件协议的请求 | 响应阶段 | 适合响应状态码、响应头、响应体改写 |

当用户只需要一两条固定规则，优先用静态规则文件；需要按请求动态生成，再用 `rulesServer` / `resRulesServer`。

## pipe hook 名称

```txt
reqRead reqWrite resRead resWrite
wsReqRead wsReqWrite wsResRead wsResWrite
tunnelReqRead tunnelReqWrite tunnelResRead tunnelResWrite
```

HTTP pipe hook 内监听 `request`；WebSocket 和 Tunnel pipe hook 内监听 `connect`，参数是 socket。不要把 WS/Tunnel pipe 写成 `server.on('request')`。

## 最小 hook 模板

### rulesServer

```ts
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginRequest, res: Whistle.PluginResponse) => {
    const { ruleValue } = req.originalReq;
    res.end(`* reqHeaders://x-my-plugin=${ruleValue || '1'}`);
  });
};
```

`rulesServer` 可直接 `res.end(rulesText)`，也可返回 `JSON.stringify({ rules, values })` 同时注入临时 Values。不要返回响应 body；要 mock 响应用 `server` 或返回 `file://` / `resBody://` 规则。

### server

```ts
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginServerRequest, res: Whistle.PluginServerResponse) => {
    if (req.originalReq.ruleValue === 'mock') {
      req.resume();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    req.passThrough();
  });
  server.on('upgrade', (req) => req.passThrough());
  server.on('connect', (req) => req.passThrough());
};
```

### auth

```ts
export default async (req: Whistle.PluginAuthRequest, options: Whistle.PluginOptions) => {
  if (req.fullUrl.includes('/public/')) return true;
  req.setHtml('<strong>Access Denied</strong>');
  return false;
};
```

普通代理流量的 `auth` 由插件协议规则触发，例如：

```txt
www.example.com whistle.my-plugin://
```

只有要让 `auth` 也作用于插件自身 UI 请求时，才在 `package.json` 里慎用：

```json
{
  "whistleConfig": {
    "enableAuthUI": true
  }
}
```
