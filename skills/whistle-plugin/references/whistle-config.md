# whistleConfig 完整配置

`package.json` 中 `whistleConfig` 字段的所有配置项。

## 基础配置

```json
{
  "whistleConfig": {
    "priority": 0,
    "hideLongProtocol": false,
    "hideShortProtocol": false,
    "favicon": "",
    "noOption": false,
    "registry": "",
    "tunnelKey": "",
    "enableAuthUI": false,
    "staticDir": ""
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `priority` | number | 0 | 插件优先级，0 为默认，数值越大优先级越高。默认按更新时间排序 |
| `hideLongProtocol` | boolean | false | 隐藏长协议 `whistle.xxx://` |
| `hideShortProtocol` | boolean | false | 隐藏短协议 `xxx://` |
| `favicon` | string | "" | Tab 页图标 URL |
| `noOption` | boolean | false | 无操作界面时将 Option 按钮置灰 |
| `registry` | string | "" | npm registry 地址 |
| `tunnelKey` | string | "" | TUNNEL 代理时携带的请求头 key |
| `enableAuthUI` | boolean | false | 是否启用 auth hook 鉴权拦截。设为 true 后 auth hook 才会对匹配的请求生效（慎用：可能导致无法访问插件自身页面） |
| `staticDir` | string | "" | 静态文件目录，设置后自动启用 Express 静态服务 |

## UI 模式配置

```json
{
  "whistleConfig": {
    "homepage": "",
    "pluginHomepage": "",
    "openInPlugins": true,
    "openInModal": null,
    "openExternal": false
  }
}
```

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `homepage` | string | 插件帮助页面地址（显示在 Option 弹窗中） |
| `pluginHomepage` | string | 自定义插件操作页面地址（新标签页模式） |
| `openInPlugins` | boolean | 配合 `pluginHomepage`，在 Plugins Tab 中打开；官方示例语义下默认按 true 理解 |
| `openInModal` | object/null | `{ width, height }` 对话框模式 |
| `openExternal` | boolean | 在外部浏览器打开 |

## UI 扩展配置

### Network 自定义列

```json
{
  "networkColumn": {
    "name": "列显示名",
    "key": "req.headers.referer",
    "iconKey": "",
    "showTitle": true,
    "width": 120
  }
}
```

`key` 是 session 对象的属性路径，常见路径：
- `req.headers.xxx` — 请求头
- `res.headers.xxx` — 响应头
- `req.body` — 请求体
- `res.body` — 响应体
- `clientIp` — 客户端 IP
- `serverIp` — 服务端 IP
- `statusCode` — 状态码
- `url` / `fullUrl` — 请求 URL

### WebWorker

```json
{
  "webWorker": "/public/webWorker.js"
}
```

```js
// webWorker.js — 对每个 session 数据进行处理
module.exports = function(session, next) {
  // session 包含完整的请求数据
  // next({ 列名: 值, style: { color, bgColor, fontStyle } })
  next({
    customColumn: 'value',
    style: session.error
      ? { color: '#fff', fontStyle: 'italic', bgColor: 'red' }
      : undefined
  });
};
```

### 右键菜单

```json
{
  "networkMenus": [
    {
      "name": "菜单名",
      "action": "/public/menu-page.html",
      "required": false,
      "requiredTreeNode": false,
      "urlPattern": "github.com"
    }
  ],
  "rulesMenus": [...],
  "valuesMenus": [...],
  "pluginsMenus": [...]
}
```

菜单页面通过 `window.whistleBridge` 与 Whistle 交互。

### 自定义 Tab

```json
{
  "inspectorsTab": {
    "name": "Tab 名",
    "action": "/public/tab.html",
    "icon": "",
    "req": {
      "name": "Request Tab 名",
      "action": "/public/req-tab.html",
      "icon": ""
    },
    "res": {
      "name": "Response Tab 名",
      "action": "/public/res-tab.html",
      "icon": ""
    }
  },
  "composerTab": {
    "name": "Composer Tab 名",
    "action": "/public/composer.html",
    "icon": ""
  },
  "toolsTab": {
    "name": "Tools Tab 名",
    "action": "/public/tools.html",
    "icon": ""
  }
}
```

## 规则补全配置

```json
{
  "hintUrl": "/cgi-bin/get-hints",
  "hintList": ["option1", "option2"],
  "pluginVars": {
    "hintSuffix": ["=", ".key1=default", ".key2"],
    "hintUrl": "/cgi-bin/plugin-vars"
  }
}
```

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `hintUrl` | string | 协议规则补全提示接口 URL |
| `hintList` | string[] | 静态补全列表（与 hintUrl 二选一） |
| `pluginVars.hintSuffix` | string[] | 变量后缀模式定义 |
| `pluginVars.hintUrl` | string | 变量补全接口 URL |

## 远程资源配置

```json
{
  "rulesUrl": "",
  "valuesUrl": "",
  "installUrl": "",
  "installRegistry": ""
}
```

| 配置项 | 说明 |
|--------|------|
| `rulesUrl` | 远程规则文件 URL |
| `valuesUrl` | 远程 Values 文件 URL |
| `installUrl` | 安装引导页面 URL |
| `installRegistry` | 安装用 npm registry |

## 完整配置示例

### 最简插件

```json
{
  "name": "whistle.my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "whistleConfig": {}
}
```

### 带自定义列和 WebWorker

```json
{
  "name": "whistle.api-monitor",
  "version": "1.0.0",
  "main": "index.js",
  "whistleConfig": {
    "networkColumn": {
      "name": "API Time",
      "key": "res.headers.x-response-time",
      "showTitle": true,
      "width": 100
    },
    "webWorker": "/public/webWorker.js"
  }
}
```

### 带 UI 扩展

```json
{
  "name": "whistle.dev-tools",
  "version": "1.0.0",
  "main": "index.js",
  "whistleConfig": {
    "networkMenus": [
      { "name": "Send to Dev", "action": "/public/send.html", "required": true }
    ],
    "inspectorsTab": {
      "name": "DevTools",
      "action": "/public/inspectors.html",
      "req": { "name": "Request", "action": "/public/req.html" },
      "res": { "name": "Response", "action": "/public/res.html" }
    }
  }
}
```

### 带规则补全

```json
{
  "name": "whistle.mock-config",
  "version": "1.0.0",
  "main": "index.js",
  "whistleConfig": {
    "hintUrl": "/cgi-bin/get-hints",
    "pluginVars": {
      "hintSuffix": ["=", ".env=dev", ".region=cn"],
      "hintUrl": "/cgi-bin/plugin-vars"
    }
  }
}
```
