# Whistle 配置与抓包

## 命令执行上下文

`w2` 命令读取或修改的是用户真实机器上的 Whistle 运行状态。不要在沙箱环境中运行后就得出结论，尤其是：

```sh
w2 status
w2 status --all
w2 start
w2 restart
w2 stop
w2 proxy
w2 ca
w2 install
w2 uninstall
```

处理原则：

1. 要确认真实状态时，请求在非沙箱/用户真实环境执行。
2. 如果工具只能返回沙箱结果，必须告诉用户该结果不能代表当前系统代理、证书或 Whistle 进程状态。
3. `w2 proxy`、`w2 ca`、`w2 start/stop/restart` 会改变系统代理、证书或进程状态，执行前要说明影响并请求授权。
4. 只生成建议命令时，可以直接给命令，不要声称已经确认了状态。

## 安装和启动

优先确认用户环境是否已经安装 Whistle。常用命令：

```sh
npm install -g whistle
w2 start
w2 status
w2 restart
w2 stop
w2 -h
```

管理界面通常是：

```txt
http://local.whistlejs.com
http://127.0.0.1:8899
```

如果用户需要设置系统代理，可使用：

```sh
w2 proxy
w2 proxy 0
w2 proxy 8100
w2 proxy 127.0.0.1:8899
```

证书相关命令：

```sh
w2 ca
w2 ca 8899
w2 ca 192.168.1.10:8899
```

插件命令：

```sh
w2 install whistle.xxx
w2 uninstall whistle.xxx
w2 exec xxx
w2 run
```

## 桌面浏览器抓包

检查顺序：

1. 在用户真实环境执行 `w2 status` 确认服务正在运行。
2. 浏览器或系统代理指向 `127.0.0.1:8899`。
3. 打开管理界面 Network，访问一个 HTTP URL 验证是否有流量。
4. 如果 HTTPS 只有 `Tunnel to`，安装并信任根证书，开启 HTTPS capture。
5. 如果浏览器使用独立代理配置或扩展，检查是否绕过系统代理。

## HTTPS 抓包

基础步骤：

1. 打开 Whistle 的 HTTPS 面板。
2. 下载或通过二维码安装 root CA。
3. 在发起请求的客户端信任该 root CA。
4. 开启 HTTPS capture。
5. 刷新页面或重启 App，再看 Network。

平台注意事项：

- iOS：安装描述文件后，还要在证书信任设置中启用完全信任。
- Android：浏览器一般较容易；App 可能不信任用户 CA，需要调试包的 network security config 支持用户 CA，或使用测试环境。
- Firefox：可能需要单独导入证书，或启用使用系统根证书。
- 证书锁定：如果 App 或 SDK 做了 pinning，Whistle 不能单靠根证书解密该域名。

自定义证书注意事项：

- 域名证书必须成对上传私钥和证书，如 `.key` + `.crt/.cer/.pem`。
- 证书和私钥内容必须匹配。
- 根证书不能直接通过普通自定义证书入口上传；需要放到 Whistle 证书目录后重启对应实例。
- 多实例时确认上传到哪个实例的证书目录。

## 移动端抓包

标准流程：

1. 手机和电脑在同一局域网。
2. Whistle Online 面板确认电脑可被手机访问的 LAN IP 和端口。
3. 手机 Wi-Fi 设置里配置手动代理：host 为电脑 LAN IP，port 通常是 `8899`。
4. 手机浏览器访问管理页面或 HTTPS 证书地址，安装证书。
5. 访问一个 HTTP URL 验证 Network 有流量，再验证 HTTPS。

排查点：

- 手机是否连了代理所在电脑可访问的同一个网络。
- 电脑防火墙是否允许端口访问。
- VPN、公司网络、热点隔离是否阻断局域网访问。
- 代理 IP 是否选错，尤其电脑有多个网卡时。
- iOS 是否完成“完全信任”。

## 多实例和端口

如果默认 `8899` 被占用，指定端口：

```sh
w2 start -p 8100
w2 restart -p 8100
w2 proxy 8100
```

当用户同时运行多个 Whistle 实例时，回答里必须明确当前规则、证书和代理端口属于哪个实例。

## UI 面板定位

- Network：看请求列表、完整 URL、请求/响应详情、Overview 规则匹配、Replay/Edit。
- HTTPS：安装证书、开关 HTTPS capture、HTTP/2、自定义证书。
- Online：查看可用于移动端代理的 IP/端口。
- Rules：编辑规则，用 `#` 注释，分组管理。
- Values：保存多行内容、JSON、headers、脚本、批量规则。
- Composer：构造请求，适合复现接口问题。
- Console/Log：查看页面注入日志和 Whistle 服务异常。
- Plugins：安装、启用、调试插件。

## UI 搜索语法

Network 面板常用搜索：

```txt
keyword       # 搜 URL
m:GET         # 方法
h:cookie      # 请求头
b:token       # 请求体
i:10.0.0.1    # IP
s:500         # 状态码
t:json        # 类型
mark:tag      # 标记
app:name      # 应用
e:error       # 错误
```

Rules 和 Values 面板搜索：

```txt
keyword   # 搜名称和内容
k:mock    # 只搜名称
v:token   # 只搜内容
```
