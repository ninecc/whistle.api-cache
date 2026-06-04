# Whistle 安全边界、版本确认和问法

## 安全边界

Whistle 可以安装根证书、解密 HTTPS、改写请求、注入脚本和转发敏感流量。回答时默认提醒用户只在授权设备、测试环境或自己控制的网络中使用。

高风险操作包括：

- 安装并信任根证书。
- 解密包含账号、Cookie、Token、支付、隐私数据的 HTTPS 流量。
- 全局 `*` 规则改写所有请求。
- 注入 JS 到页面。
- 把流量转发到第三方代理。
- 把生产 API mock 成非真实响应。
- 导出或分享包含敏感头部、Cookie、请求体的抓包数据。

安全建议：

```txt
# 避免全局过宽，优先缩窄域名和路径
www.example.com/api ...

# 对敏感或 pinning 域名禁用解密
auth.example.com disable://capture
payment.example.com disable://capture
```

用完后建议：

```sh
w2 proxy 0
w2 stop
```

并按平台需要取消根证书信任。

## 敏感信息处理

当用户贴出 Rules、headers、curl 或 Network 明细时：

- 主动提醒隐藏 `authorization`、`cookie`、`set-cookie`、token、手机号、身份证、邮箱等敏感值。
- 输出示例时使用 `Bearer <token>`、`session=<redacted>`。
- 不要求用户上传完整抓包文件，除非确实必要。

## 版本确认

这些情况需要确认版本：

- 用户使用较新的协议或插件能力。
- `reqScript/resScript` 可用变量不确定。
- HTTP/2、证书、移动端行为和文档描述不一致。
- 命令行参数、插件安装或 UI 面板名称不一致。

收集：

```sh
w2 -V
w2 status
node -v
npm -v
```

不要因为版本未知就停下。先给通用方案，并标注“如当前版本不支持该协议，需要按 `w2 -V` 调整”。

## 问法策略

优先少问、能做就做：

- 生成规则缺域名：用 `www.example.com` 占位，并要求替换。
- 缺本地端口：用 `localhost:5173` 或让用户确认。
- 缺文件路径：用 `/Users/me/project/dist` 占位。
- 排查缺现象：先给最短验证路径，不一次性问完所有信息。

必要追问不超过 3 个：

```txt
1. 目标完整 URL 是什么？
2. 你希望转发到本地哪个地址或目录？
3. Network 里看到的是正常请求、Tunnel to、captureError，还是完全没有请求？
```

## 生产环境提示

如果规则会影响生产域名：

- 明确建议先用个人测试设备或测试账号。
- 避免写全域名宽规则，优先限制 path、method、clientIp。
- 对 mock、限速、错误注入加 filter 或概率。
- 提醒用户确认规则分组启用范围。

示例：

```txt
www.example.com/api statusCode://500 includeFilter://clientIp:192.168.1.23 includeFilter://chance:0.1
```

如果 filter 无法表达足够安全的条件，建议改用 `reqScript` 精确判断。
