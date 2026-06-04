# Whistle 场景化规则模板

生成规则时优先套用这些场景模板，再按用户提供的真实域名、端口、路径、文件目录替换占位符。

## 本地前端联调

目标：线上/测试域名页面走本地 dev server，API 仍走原服务。

```txt
# 页面和前端路由走本地
www.example.com http://localhost:port excludeFilter://*/api excludeFilter://*/static

# 如果本地服务需要跨域响应
www.example.com resCors://*
```

验证：

1. Network 中页面主请求命中本地服务。
2. API 请求没有被转到本地。
3. DevTools 禁用缓存，避免旧资源干扰。

## 本地静态资源替换

目标：只替换 JS/CSS/图片等静态资源。

```txt
# 替换静态目录
www.example.com/static file:///Users/me/project/dist/static

# 替换单个 JS 文件
www.example.com/assets/app.js file:///Users/me/project/dist/app.js
```

风险：

- 本地目录结构必须和 URL path 对应。
- sourcemap、chunk hash、缓存可能影响验证。

## API 转发到本地或测试后端

```txt
# 转到本地后端
www.example.com/api http://localhost:port

# 转到测试环境
www.example.com/api https://test-api.example.com/api

# 只转 GET
www.example.com/api http://localhost:port includeFilter://m:GET
```

验证：Network Overview 应看到对应 `http/https` 映射规则。

## API Mock

简单 JSON：

```txt
www.example.com/api/user statusCode://200
www.example.com/api/user resType://json
www.example.com/api/user file://({"id":1,"name":"mock"})
```

多行 JSON 放 Values：

```txt
# Rules
www.example.com/api/user statusCode://200
www.example.com/api/user resType://json
www.example.com/api/user file://{user.json}
```

```json
// Values: user.json
{
  "id": 1,
  "name": "mock"
}
```

## 条件 Mock

按方法：

```txt
www.example.com/api/user file://({"id":1}) includeFilter://m:GET
www.example.com/api/user statusCode://403 includeFilter://m:POST
```

按请求体复杂条件用 `reqScript`：

````txt
``` mock-by-body.js
if (method === 'POST' && body && /"role":"admin"/.test(body)) {
  rules.push('* resType://json');
  rules.push('* file://({"ok":true,"role":"admin"})');
} else {
  rules.push('* statusCode://403');
}
```

www.example.com/api/login reqScript://{mock-by-body.js}
````

## CORS 修复

普通场景：

```txt
www.example.com/api resCors://*
```

精确响应头：

```txt
www.example.com/api resHeaders://access-control-allow-origin=https://app.example.com
www.example.com/api resHeaders://access-control-allow-credentials=true
www.example.com/api resHeaders://access-control-allow-methods=GET,POST,OPTIONS
www.example.com/api resHeaders://access-control-allow-headers=content-type,authorization
```

注意：带 credentials 时不能随便用 `*`。

## 移动端 HTTPS 抓包

配置：

1. 手机和电脑同一局域网。
2. 手机 Wi-Fi 手动代理到电脑 LAN IP 和 Whistle 端口。
3. 安装并信任 Whistle 根证书。
4. HTTPS 面板开启 capture。

辅助规则：

```txt
# 有证书锁定的域名不解密
api.example.com disable://capture

# 发往 IP 的 HTTPS
192.168.1.10 enable://captureIp
```

## 绕过证书锁定域名

不能解密时，不要强行抓取明文。对 pinning 域名禁用 capture，让其他域名继续抓包：

```txt
api.pinned.example.com disable://capture
```

如果只想对特定客户端禁用：

```txt
api.pinned.example.com disable://capture includeFilter://reqH.user-agent:/android/i
```

## 上游代理和链式代理

```txt
# 全部 example.com 走上游 HTTP 代理
**.example.com proxy://127.0.0.1:8080

# API 走 SOCKS
www.example.com/api socks://127.0.0.1:1080

# host 与 proxy 同时生效
www.example.com proxy://127.0.0.1:port lineProps://proxyHost
www.example.com host://10.0.0.10
```

验证：确认上游代理日志或目标服务看到的来源符合预期。

## WebSocket 调试

```txt
# WebSocket 转发到本地
wss://www.example.com/socket ws://localhost:port/socket

# 给页面注入调试日志
www.example.com log://ws-debug
```

验证：Network 中检查 WS 连接状态和 frame。

## 页面注入调试

```txt
# 注入本地调试脚本
www.example.com htmlAppend://(<script src="http://localhost:port/debug.js"></script>) lineProps://safeHtml

# 收集 console 和异常
www.example.com log://page-debug

# Weinre
www.example.com weinre://page-debug
```

风险：注入类规则要避免作用到 JSON/API，优先加 `safeHtml` 或缩窄 pattern。

## 弱网和错误场景

```txt
# API 慢响应
www.example.com/api resDelay://2000

# 10% 概率返回 500
www.example.com/api statusCode://500 includeFilter://chance:0.1

# 限速
www.example.com/api resSpeed://20
```

验证：用 Replay 多次测试概率规则。
