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
- 常规 hook：`auth` / `verify`、`sni`、`rulesserver`、`resrulesserver`、`tunnelrulesserver`、`statsserver`、`resstatsserver`、`server`、`uiserver`
- pipe 组合：`pipe`、`pipehttp` / `httppipe`、`pipews` / `wspipe`、`pipetunnel` / `tunnelpipe`
- pipe 细粒度：`reqread`、`reqwrite`、`resread`、`reswrite`、`wsreqread`、`wsreqwrite`、`wsresread`、`wsreswrite`、`tunnelreqread`、`tunnelreqwrite`、`tunnelresread`、`tunnelreswrite`

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

## pipe hook 名称

```txt
reqRead reqWrite resRead resWrite
wsReqRead wsReqWrite wsResRead wsResWrite
tunnelReqRead tunnelReqWrite tunnelResRead tunnelResWrite
```

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

`auth` 还需要：

```json
{
  "whistleConfig": {
    "enableAuthUI": true
  }
}
```
