# whistle.api-cache

`whistle.api-cache` 是一个 Whistle 插件，用来录制 API 响应并在后续请求中自动回放缓存。适合本地联调、接口不稳定时的回放验证、重复请求加速，以及对比不同请求体的缓存命中行为。

## 你可以用它做什么

- 录制指定接口的真实响应。
- 后续相同请求自动从本地缓存回放。
- GET 请求会按标准化 URL 匹配。
- POST 请求会额外按请求体内容区分，避免不同 body 误命中同一份缓存。
- 在插件面板查看缓存列表、命中状态、最近诊断事件。
- 导出、导入、删除、禁用、恢复缓存条目。

## 安装前置

插件默认优先使用 SQLite 保存缓存元数据，并通过 `better-sqlite3` 加载 SQLite 能力。它是 native npm 依赖，安装时可能下载预编译二进制，也可能在本机编译。

推荐环境：

- Node.js `20.x`、`22.x`、`23.x` 或 `better-sqlite3` 支持的更新版本。
- npm 能访问当前 registry。
- macOS 建议安装 Xcode Command Line Tools。
- Linux 需要具备 `python3`、`make`、`g++` 等 node-gyp 编译工具。
- Windows 需要具备 Visual Studio Build Tools。

安装依赖：

```bash
npm install
```

如果你只想确认 SQLite native 依赖是否可用，可以运行：

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.exec(\"create table t(id text primary key); insert into t values ('ok')\"); console.log(db.prepare('select id from t').get().id); db.close();"
```

输出 `ok` 表示当前 Node 环境可以加载 `better-sqlite3`。

注意：系统里存在 `/usr/bin/sqlite3` 只能说明 SQLite 命令行工具可用；插件实际依赖的是 Whistle 运行插件时的 Node 进程能否加载 `better-sqlite3`。

## 启用插件

安装并启动 Whistle 后，在 Rules 中为目标接口添加插件规则。

自动录制并回放：

```txt
www.example.com/api whistle.api-cache://auto
```

只录制不回放：

```txt
www.example.com/api whistle.api-cache://record
```

只回放不录制：

```txt
www.example.com/api whistle.api-cache://replay
```

本地服务示例：

```txt
http://127.0.0.1:18080/api whistle.api-cache://auto
```

推荐先用较窄的 URL 范围启用，例如只匹配 `/api` 或某个接口路径，确认效果后再扩大范围。

## 使用流程

1. 在 Whistle Rules 中添加 `whistle.api-cache://auto` 规则。
2. 发起一次真实请求，插件会在响应可缓存时记录缓存。
3. 再次发起相同请求，命中后响应头会包含：

```txt
x-whistle-cache: HIT
```

4. 打开插件面板查看缓存列表、命中次数、过期时间和最近诊断事件。

如果没有命中，可以在插件面板的最近事件中查看原因，例如请求体缺失、URL 不匹配、缓存过期、条目被禁用等。

## 缓存规则说明

插件只缓存相对安全、适合回放的响应：

- 默认缓存 GET/POST 的 JSON 或文本响应。
- 带认证信息、`set-cookie` 等高风险响应会跳过。
- body 超过配置上限会跳过。
- 回放时会重新计算 `content-length`。
- 回放时会注入 `x-whistle-cache: HIT`。

POST 请求会将请求体纳入缓存 key。也就是说，同一个 URL 下不同 POST body 会保存为不同缓存，避免误回放。

## 插件面板

插件面板可以用于：

- 查看当前缓存条目。
- 查看命中次数和最近命中时间。
- 删除单条或批量删除缓存。
- 清理过期缓存。
- 启用或禁用缓存条目。
- 调整 TTL。
- 导出和导入缓存。
- 查看最近 STORE、HIT、MISS、BYPASS、ERROR 事件。

状态信息里还会显示当前实际存储方式：

- `storage.active = sqlite`：正在使用 SQLite。
- `storage.active = file`：SQLite 初始化失败，已降级为文件存储。
- `storage.fallbackReason`：降级原因。

## 存储文件

默认数据目录：

```txt
.whistle-cache-data/
```

当 Whistle 传入 `storage`、`storageDir`、`dataDir` 或 `baseDir` 时，插件会在对应目录下使用：

```txt
whistle.cache/
```

典型结构：

```txt
whistle.cache/
  cache.sqlite3
  cache.sqlite3-wal
  cache.sqlite3-shm
  objects/
    original/
      <sha256>.body
    editable/
      <entryId>.body
```

文件说明：

- `cache.sqlite3`：SQLite 主数据库，保存缓存元数据。
- `cache.sqlite3-wal`：SQLite WAL 写入日志，正常文件。
- `cache.sqlite3-shm`：SQLite WAL 共享索引文件，正常文件。
- `objects/original/`：录制得到的原始响应 body。
- `objects/editable/`：后续可编辑 active body。

不要在插件运行中手动删除 `cache.sqlite3-wal` 或 `cache.sqlite3-shm`。

## 存储降级

默认模式是 `sqlite-first`：

- SQLite 可用时使用 `cache.sqlite3`。
- SQLite 初始化失败时自动降级为文件存储。
- 降级原因会显示在插件状态里。

可选模式：

- `sqlite-first`：默认模式，优先 SQLite，失败后降级文件存储。
- `sqlite-only`：只允许 SQLite，初始化失败时直接报错，适合排查。
- `file-only`：只使用文件存储，适合临时绕过 native 依赖问题。

## 本机真实联调

项目提供一个本机 Whistle e2e 脚本，用于验证真实 Whistle 代理链路。

先确保 Whistle 正在运行，默认端口为 `8899`。

执行：

```bash
WHISTLE_E2E_RUN=1 npm run e2e:whistle-local
```

脚本会临时写入 `plugin_api_cache_e2e` 规则并在结束后恢复规则选中态。它会保留原规则内容，并在恢复选中态时带回原规则内容，避免清空已有规则。

## 常见问题

### 为什么没有命中缓存？

常见原因：

- 请求 URL 或忽略 query 后的 URL 不一致。
- POST 请求体不同。
- POST 请求体不可用，无法与 body-bound 缓存匹配。
- 缓存已过期。
- 条目被禁用。
- 响应因认证、cookie、body 过大或 content-type 不匹配被跳过。

建议先看插件面板的最近事件。

### 为什么有 `cache.sqlite3-wal` 和 `cache.sqlite3-shm`？

这是 SQLite WAL 模式的正常辅助文件，不是垃圾文件。它们用于提高读写并发和崩溃恢复能力。

### SQLite CLI 可用是否就代表插件 SQLite 可用？

不一定。`sqlite3` 命令行可用只说明系统安装了 SQLite CLI。插件使用的是 `better-sqlite3`，需要 Whistle 运行插件时的 Node 进程能够加载 native module。

## 开发命令

构建：

```bash
npm run build
```

测试：

```bash
npm test
```

本地开发监听：

```bash
npm run dev
```
