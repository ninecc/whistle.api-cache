# Whistle 排错手册

## 命令结果可信度

排查 Whistle 运行状态时，`w2 status`、端口监听、系统代理、证书信任、真实 rules/values 文件都属于用户机器运行态。不要用沙箱中的结果直接判断用户环境。需要确认时，在真实环境执行；如果只能在沙箱中执行，先声明结果不具备诊断效力。

## 排错原则

先把问题定位到一层：

1. Whistle 是否运行。
2. 客户端请求是否经过 Whistle。
3. HTTPS 是否被解密。
4. 规则是否匹配。
5. operation 是否按预期生效。
6. filters、缓存、优先级、上游代理或目标服务是否影响结果。

每次只改一个变量，优先用 Network 中已出现的请求做验证。

## 无任何流量

检查：

```sh
w2 status
```

该命令必须在用户真实环境执行。然后确认：

- 客户端代理 host/port 是否正确。
- 电脑有多个网卡时，移动端是否使用了可访问的 LAN IP。
- 防火墙是否放行 Whistle 端口。
- VPN、公司网络、热点隔离是否拦截局域网访问。
- 浏览器是否使用独立代理或代理扩展绕过系统代理。
- 系统代理是否被其他工具覆盖。

验证动作：

1. 先访问 HTTP URL。
2. 如果 HTTP 可见，再处理 HTTPS。
3. 如果桌面可见、移动端不可见，问题通常在 LAN IP、防火墙或手机代理设置。

## 只有 Tunnel to

可能原因：

- HTTPS capture 未开启。
- 根证书未安装或未信任。
- 目标是 IP 或没有正常 SNI。
- 这不是 HTTP/HTTPS，而是 TCP 隧道。

处理：

```txt
# 发往 IP 的 HTTPS
192.168.1.10 enable://captureIp
192.168.1.10:443 enable://capture
```

如果仍是 Tunnel，先确认是否真的是 HTTP/HTTPS。普通 TCP 不能按 HTTP 解析。

## captureError

常见原因：

- 客户端未信任 Whistle 根证书。
- iOS 只安装证书但未开启完全信任。
- Firefox 未使用系统根证书。
- Android App 不信任用户 CA。
- App 或 SDK 启用了证书锁定。
- 自定义证书或系统时间异常。

处理建议：

- 浏览器问题：重新安装证书，检查浏览器证书设置。
- iOS：重新安装描述文件并开启完全信任。
- Android App：使用可调试包或配置 network security config。
- pinning：对该域名禁用 capture，或改用可测试环境。

```txt
api.example.com disable://capture
```

## 规则不匹配

检查顺序：

1. 在 Network 复制完整 URL。
2. 用最窄规则测试，不要一开始写复杂通配或正则。
3. 暂时去掉 filters。
4. 在 Network Overview 看实际匹配了哪些规则。
5. 检查是否有启用的规则分组、注释、拼写错误。

测试规则：

```txt
www.example.com/api resHeaders://x-whistle-hit=1
```

如果响应头出现，说明 pattern 匹配，后续再排查 operation。

## operation 不生效

按 operation 类型检查：

- `file://`：路径必须存在，建议绝对路径；目录映射要确认 URL path 与目录结构对应。
- `http://` / `https://`：目标服务是否可从 Whistle 主机访问。
- `host://`：DNS/连接层生效，可能被代理规则影响。
- `proxy://` / `socks://`：上游代理是否可用；如需和 host 同时生效考虑 `lineProps://proxyHost`。
- `reqHeaders://` / `resHeaders://`：确认大小写、覆盖方式、是否被服务端/浏览器缓存影响。
- `statusCode://` / `redirect://`：确认规则作用在目标请求，不是子资源或预检请求。
- 注入类规则：确认响应是 HTML，必要时加 `lineProps://safeHtml` 或 `strictHtml`。

## 规则优先级和覆盖

后续规则可能覆盖前面同协议规则。先用单条规则确认，再逐步加回。

```txt
www.example.com/path file:///Users/me/a.html
www.example.com/path file:///Users/me/b.html lineProps://important
```

`lineProps://important` 只提升同协议规则优先级，不要滥用。更推荐缩窄 pattern。

## filters 导致不生效

排查：

1. 删除所有 filters，确认基础规则有效。
2. 一次只加一个 filter。
3. 对 method、header、body、status 逐项核对 Network 中的实际值。
4. 复杂 AND/OR 条件不要硬堆 filters，改用更窄 pattern 或 `reqScript`。

## CORS 问题

如果页面报跨域：

```txt
www.example.com/api resCors://*
www.example.com/api resHeaders://access-control-allow-origin=*
```

注意：

- 带 credentials 的跨域不能随便用 `*`。
- 预检 OPTIONS 也需要匹配到。
- 浏览器缓存和 Service Worker 可能掩盖结果。

## 缓存和 Service Worker

如果规则看似生效不稳定：

- DevTools 禁用缓存。
- 清理站点数据。
- 检查 Service Worker 是否拦截请求。
- 对目标请求 Replay，而不是只刷新页面。

## 插件问题

检查：

```sh
w2 install whistle.xxx
w2 uninstall whistle.xxx
w2 run
```

排查：

- Plugins 面板是否启用。
- 插件规则前缀是否写对。
- `w2 run` 是否输出插件或系统日志。
- 插件依赖是否安装在当前 Whistle 实例中。
