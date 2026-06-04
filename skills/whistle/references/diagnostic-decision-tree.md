# Whistle 问诊表与排错决策树

## 信息收集模板

排查前尽量收集：

```txt
Whistle 版本：
启动方式和端口：
客户端系统/浏览器/App：
客户端代理 host/port：
HTTP 请求是否可见：
HTTPS 请求在 Network 中显示为：请求明细 / Tunnel to / captureError / 不出现
目标完整 URL：
当前 Rules 片段：
是否安装并信任根证书：
是否移动端/真机：
是否有 VPN、公司代理、防火墙、浏览器代理扩展：
期望效果：
实际现象：
```

用户没给完整信息时，先按当前现象给最可能路径，不要一次追问全部字段。

如果需要你代跑命令，先判断命令是否依赖真实系统状态。`w2 status --all`、系统代理、证书、进程、真实 rules/values 文件读取必须在非沙箱/真实用户环境中运行；沙箱结果只能作为“当前工具环境”的输出，不能作为 Whistle 诊断结论。

## 决策树

### 1. Network 完全没有请求

判断：

1. 在用户真实环境执行 `w2 status`，确认 Whistle 是否运行。
2. 客户端代理是否指向 Whistle host/port。
3. 客户端和 Whistle 主机是否互通。
4. 是否被 VPN、防火墙、代理扩展绕过。

下一步：

```txt
先访问一个 HTTP URL。如果 HTTP 都不可见，先不要排查 HTTPS 或 Rules。
```

### 2. HTTP 可见，HTTPS 不可见或只有 Tunnel

判断：

1. HTTPS capture 是否开启。
2. 根证书是否安装在发起请求的客户端。
3. 根证书是否被信任。
4. 是否访问 IP 或缺少 SNI。
5. 是否是普通 TCP。

下一步：

```txt
# 发往 IP 的 HTTPS 可尝试
192.168.1.10 enable://captureIp
```

如果是 pinning，转到第 3 步。

### 3. 出现 captureError

判断：

1. iOS 是否开启完全信任。
2. Firefox 是否单独信任证书。
3. Android App 是否信任用户 CA。
4. App/SDK 是否证书锁定。
5. 系统时间和证书链是否异常。

下一步：

```txt
# 对证书锁定域名禁用解密
api.example.com disable://capture
```

### 4. 请求可见，但规则不命中

判断：

1. 复制 Network 中完整 URL。
2. 用 host 或完整 path 写最小规则。
3. 删除 filters。
4. 确认规则分组启用。
5. 看 Network Overview。

测试：

```txt
www.example.com/api resHeaders://x-whistle-hit=1
```

响应头出现后再加复杂操作。

### 5. 规则命中，但效果不对

按 operation 分流：

- `file://`：检查绝对路径、目录结构、文件存在、权限。
- `http/https/ws/wss`：检查目标服务可访问、路径拼接、协议是否正确。
- `host/proxy/socks`：检查连接层规则、上游代理可用性、是否需要 `proxyHost`。
- `reqHeaders/resHeaders`：检查覆盖格式、浏览器缓存、大小写、预检请求。
- `statusCode/redirect`：确认命中的是主请求还是子请求。
- 注入类：确认响应是 HTML，不是 JSON 或二进制。

下一步：只保留一条 operation 验证，再逐步组合。

### 6. 规则偶发不生效

常见原因：

- Service Worker 缓存。
- 浏览器缓存。
- 多条同协议规则覆盖。
- 概率 filter。
- 请求实际走了不同域名或 CDN。
- App 内部缓存或连接复用。

下一步：

1. DevTools 禁用缓存。
2. 清理站点数据或注销 Service Worker。
3. Replay 单个请求。
4. 缩窄 pattern。
5. 检查 `lineProps://important` 是否必要。

### 7. 移动端失败

判断：

1. 手机是否能打开 Whistle 管理页。
2. 手机代理 IP 是否是电脑 LAN IP，不是 `127.0.0.1`。
3. 端口是否被防火墙拦截。
4. 是否安装并完全信任证书。
5. App 是否不信任用户 CA 或 pinning。

下一步：先用手机浏览器访问 HTTP URL，确认基础代理链路。

## 回答模板

````txt
从现象看，优先排查：<层级>

先做这 3 步：
1. ...
2. ...
3. ...

临时验证规则：
```txt
...
```

如果这一步通过，再继续检查：...
````
