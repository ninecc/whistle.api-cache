# Whistle 插件开发常见模式

## 模式1：模拟 API 响应

**场景：** 前端开发时 mock 后端接口

**选择 hook：** server

```ts
// src/server.ts
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginServerRequest, res: Whistle.PluginServerResponse) => {
    const { ruleValue } = req.originalReq;

    // ruleValue 来自规则配置：xxx://mock-users
    const mockData: Record<string, any> = {
      'mock-users': [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      'mock-user-detail': { id: 1, name: 'Alice', email: 'alice@example.com' },
    };

    if (mockData[ruleValue]) {
      req.on('data', () => {});
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify(mockData[ruleValue]));
      });
      return;
    }

    req.passThrough();
  });

  server.on('upgrade', (req) => req.passThrough());
  server.on('connect', (req) => req.passThrough());
};
```

**规则配置：**
```
api.example.com/users mock-api://mock-users
api.example.com/users/1 mock-api://mock-user-detail
```

---

## 模式2：请求鉴权网关

**场景：** 统一管控代理访问权限

**选择 hook：** auth

```ts
// src/auth.ts
export default async (req: Whistle.PluginAuthRequest, options: Whistle.PluginOptions) => {
  const { fullUrl } = req;

  // 白名单放行
  const allowList = ['/public/', '/health', '/favicon.ico'];
  if (allowList.some(path => fullUrl.includes(path))) {
    return true;
  }

  // 检查 Token
  const token = req.headers['x-access-token']
    || new URL(fullUrl).searchParams.get('token');

  if (!token) {
    req.setRedirect(`https://auth.example.com/login?redirect=${encodeURIComponent(fullUrl)}`);
    return false;
  }

  // 验证 Token（可调用内部服务）
  try {
    // const valid = await verifyToken(token);
    // if (!valid) { req.setHtml('Invalid Token'); return false; }
    return true;
  } catch {
    req.setHtml('<strong>Auth Service Unavailable</strong>');
    return false;
  }
};
```

**触发规则：**

```txt
www.example.com whistle.my-plugin://
```

普通流量鉴权不需要 `enableAuthUI`。`enableAuthUI: true` 只用于让 auth 也拦截插件自身 UI 请求，容易导致插件页面无法打开，除非用户明确需要，否则不要配置。

`req.setHeader()` 只适合设置 `x-whistle-*` 或 `proxy-authorization` 这类 Whistle 允许透传的控制头；不要把它当任意响应头设置器。

---

## 模式3：数据加密/解密管道

**场景：** 请求/响应使用自定义加密，需要在 Whistle 中解密以查看

**选择 hook：** pipe 系列。HTTP 用 `reqRead/reqWrite/resRead/resWrite`；WebSocket 用 `wsReqRead/wsReqWrite/wsResRead/wsResWrite`；Tunnel 用 `tunnelReqRead/tunnelReqWrite/tunnelResRead/tunnelResWrite`。

```ts
// src/reqRead.ts — 解密请求体。HTTP pipe hook 监听 request 事件。
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginRequest, res: Whistle.PluginResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      try {
        const decrypted = decrypt(body);  // 自定义解密
        res.end(decrypted);
      } catch {
        res.end(body);  // 解密失败则透传原始数据
      }
    });
  });
};

// src/resRead.ts — 解密响应体。HTTP pipe hook 监听 request 事件。
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginRequest, res: Whistle.PluginResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      try {
        const decrypted = decrypt(body);
        res.end(decrypted);
      } catch {
        res.end(body);
      }
    });
  });
};
```

**注意：** HTTP pipe hook 内监听 `request`；WebSocket 和 Tunnel pipe hook 内监听 `connect`，参数是 socket。`reqRead/resRead/wsReqRead/wsResRead/tunnelReqRead/tunnelResRead` 处理读入方向；`reqWrite/resWrite/wsReqWrite/wsResWrite/tunnelReqWrite/tunnelResWrite` 处理写出方向。`reqWrite/resWrite` 的修改不显示在抓包界面。

Whistle 官方文档说明所有 `*Write` 方向的实际修改内容都不会显示在 Network 抓包界面，这是预期行为；验证写出方向时要看目标服务收到的内容或最终响应，不要只看 Network body。

WS/Tunnel pipe 最小模板：

```ts
export default (server: Whistle.PluginServer) => {
  server.on('connect', (socket) => {
    socket.pipe(socket);
  });
};
```

---

## 模式4：请求审计日志

**场景：** 记录所有请求/响应信息用于审计

**选择 hook：** statsServer + resStatsServer + Storage

```ts
// src/statsServer.ts
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  const storage = options.storage;

  server.on('request', (req: Whistle.PluginRequest) => {
    const { originalReq } = req;
    const logEntry = {
      timestamp: Date.now(),
      url: originalReq.fullUrl,
      method: originalReq.method,
      clientIp: originalReq.clientIp,
      headers: originalReq.headers,
    };

    req.getSession((session) => {
      if (session) {
        const fullLog = {
          ...logEntry,
          statusCode: session.res.statusCode,
          serverIp: session.res.serverIp,
        };
        // 写入 Storage 持久化
        const key = `log:${logEntry.timestamp}`;
        storage.writeFile(key, JSON.stringify(fullLog));
      }
    });
  });
};
```

---

## 模式5：动态响应改写

**场景：** 根据服务端响应内容动态修改响应

**选择 hook：** resRulesServer

```ts
// src/resRulesServer.ts
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginRequest, res: Whistle.PluginResponse) => {
    const { ruleValue } = req.originalReq;

    // ruleValue 为空时对 5xx 错误统一处理
    if (!ruleValue) {
      res.end('* resBody://(Service Unavailable) includeFilter://s:500');
      return;
    }

    // 根据规则值动态生成
    res.end(`* resHeaders://x-modified-by=plugin includeFilter://s:200`);
  });
};
```

---

`rulesServer` / `resRulesServer` 返回的是规则文本。需要同时生成临时 Values 时返回 `JSON.stringify({ rules, values })`；如果要直接返回 JSON 响应体，改用 `server` hook。

---

## 模式6：自定义 TLS 证书

**场景：** 特定域名使用自定义证书

**选择 hook：** sniCallback

```ts
// src/sniCallback.ts
import fs from 'fs';
import path from 'path';

// 预加载证书
const certs: Record<string, { key: string; cert: string; mtime?: number }> = {};

function loadCert(domain: string) {
  if (certs[domain]) return certs[domain];
  try {
    const key = fs.readFileSync(path.join(__dirname, `../certs/${domain}.key`), 'utf8');
    const cert = fs.readFileSync(path.join(__dirname, `../certs/${domain}.crt`), 'utf8');
    certs[domain] = { key, cert, mtime: Date.now() };
    return certs[domain];
  } catch {
    return null;
  }
}

export default async (req: Whistle.PluginSNIRequest, options: Whistle.PluginOptions) => {
  const { fullUrl } = req;
  const domain = new URL(fullUrl).hostname;

  // 特定域名不解密
  if (domain.endsWith('.bank.com')) {
    return false;
  }

  // 自定义证书
  const customCert = loadCert(domain);
  if (customCert) {
    return customCert;
  }

  // 默认使用 Whistle 内置证书
  return true;
};
```

**规则配置：** `*.example.com sniCallback://my-sni-plugin(sniValue)`

`sniCallback` 返回值为 `boolean | { key: string, cert: string, mtime?: number }`；`mtime` 可用于证书缓存时间戳。

优先从 `req.originalReq.servername` / `req.originalReq.sniValue` 取 SNI 相关上下文。返回值只使用 `true`、`false` 或 `{ key, cert, mtime? }`；其他返回值不要依赖。

---

## 模式7：插件 UI 管理界面

**场景：** 提供可视化配置界面

**选择 hook：** uiServer + statsServer + Storage

插件 Tab、Modal、Menu 页面可通过 `window.whistleBridge` 与 Whistle 页面交互。跨页面或 iframe 通信时可使用 Whistle 的特殊路径前缀：

```txt
/.whistle-path.5b6af7b9884e1165./whistle.xxx/path/to
/_WHISTLE_5b6af7b9884e1165_/
```

这些 hash-like 片段由 Whistle 注入，插件代码不要硬编码具体值；调试时从当前页面 URL 或 bridge 上下文读取。

```ts
// src/uiServer/index.ts
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import onerror from 'koa-onerror';
import serve from 'koa-static';
import path from 'path';
import Router from '@koa/router';
import setupRouter from './router';

export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  const app = new Koa();
  app.proxy = true;
  app.silent = true;
  onerror(app);
  const router = new Router();
  setupRouter(router, options.storage);  // 传入 storage
  app.use(bodyParser());
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(serve(path.join(__dirname, '../../public'), { maxage: 300000 }));
  server.on('request', app.callback());
};

// src/uiServer/router.ts
import Router from '@koa/router';

export default (router: Router, storage: any) => {
  // 获取配置
  router.get('/cgi-bin/config', async (ctx) => {
    const config = await new Promise((resolve) => {
      storage.readFile('config', (data: string | null) => {
        resolve(data ? JSON.parse(data) : {});
      });
    });
    ctx.body = { ec: 0, data: config };
  });

  // 保存配置
  router.post('/cgi-bin/config', async (ctx) => {
    const config = ctx.request.body;
    await new Promise((resolve) => {
      storage.writeFile('config', JSON.stringify(config), resolve);
    });
    ctx.body = { ec: 0 };
  });
};
```

---

## 模式8：规则自动补全

**场景：** 为插件协议提供智能补全

**选择 hook：** uiServer + hintUrl + pluginVars

```json
// package.json
{
  "whistleConfig": {
    "hintUrl": "/cgi-bin/get-hints",
    "pluginVars": {
      "hintSuffix": ["=", ".env=dev", ".region"],
      "hintUrl": "/cgi-bin/plugin-vars"
    }
  }
}
```

```ts
// src/uiServer/router.ts
import Router from '@koa/router';

const APIS = [
  'users-list', 'user-detail', 'orders', 'order-create',
  'products', 'product-search', 'inventory',
];

export default (router: Router) => {
  // 协议补全
  router.get('/cgi-bin/get-hints', (ctx) => {
    const { protocol, value } = ctx.query;
    const keyword = (value || '').toLowerCase();
    const isLong = (protocol || '').startsWith('whistle.');
    const prefix = isLong ? 'whistle.' : '';
    ctx.body = APIS
      .filter(api => api.includes(keyword))
      .map(api => `${prefix}${api}`);
  });

  // 变量补全
  router.get('/cgi-bin/plugin-vars', (ctx) => {
    const { sep, value } = ctx.query;
    const keyword = (value || '').toLowerCase();
    const envs = ['dev', 'staging', 'prod'];
    const regions = ['cn', 'us', 'eu'];

    if (sep === '.') {
      // 键值补全（.key=value 格式）
      ctx.body = regions.filter(r => r.includes(keyword));
    } else {
      // 等号补全（=value 格式）
      ctx.body = envs.filter(e => e.includes(keyword));
    }
  });
};
```

---

## 模式9：条件规则服务器

**场景：** 根据请求特征动态返回不同规则

**选择 hook：** rulesServer

```ts
// src/rulesServer.ts
export default (server: Whistle.PluginServer, options: Whistle.PluginOptions) => {
  server.on('request', (req: Whistle.PluginRequest, res: Whistle.PluginResponse) => {
    const { fullUrl, method, headers, clientIp } = req.originalReq;
    const rules: string[] = [];

    // 内网用户走测试环境
    if (clientIp.startsWith('192.168.') || clientIp.startsWith('10.')) {
      rules.push('api.example.com http://test-api.example.com');
    }

    // 移动端添加特殊头
    const ua = headers['user-agent'] || '';
    if (/Mobile|Android|iPhone/.test(ua)) {
      rules.push('* reqHeaders://x-device=mobile');
    }

    // POST 请求添加审计头
    if (method === 'POST') {
      rules.push('* reqHeaders://x-audit=1');
    }

    res.end(rules.join('\n'));
  });
};
```

---

## 模式10：全功能插件

**场景：** 同时提供鉴权、规则、统计和 UI

**选择 hook：** auth + rulesServer + statsServer + uiServer

```bash
lack init ts,auth,rulesserver,statsserver,uiserver
```

```js
// index.js
exports.auth = require('./dist/auth').default;
exports.rulesServer = require('./dist/rulesServer').default;
exports.statsServer = require('./dist/statsServer').default;
exports.uiServer = require('./dist/uiServer').default;
```

这种组合下各 hook 的调用时序：
1. **auth** — 鉴权判断（最先执行）
2. **rulesServer** — 生成请求阶段规则
3. **statsServer** — 观察请求数据
4. **uiServer** — 管理界面（独立路径访问）
