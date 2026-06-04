# Whistle 实操工作流

用于把“生成规则”推进到“稳定修改配置、可验证、可回滚”。

## 1. 脚本使用边界

脚本只做低风险辅助，不做权威判断：

- `whistle-rule-lint.js`：只提示高频误用，不是 Whistle 官方 parser。不要因为 lint 通过就断言规则一定生效。
- `whistle-paths.js`：只按常见参数推算路径，不代表当前 Whistle 真实实例、运行状态或 UI 当前选中的 storage。
- `whistle-storage-edit.js`：只在用户明确要求“直接改本地 storage 文件”时使用；默认不要自动写入。Whistle storage layout、运行态缓存、实例参数和版本差异都可能让脚本判断失准。

默认交付顺序：

1. 给用户可复制的 Rules / Values。
2. 说明放入 UI 的哪个位置。
3. 给 Network / Overview 验证方法。
4. 只有用户明确要求代写本地文件时，才进入 storage 脚本流程。

## 2. 安全写入 rules/values

优先让用户通过 UI 粘贴规则。确实需要代写本地文件时，用脚本也只能作为“带备份的试算和写入工具”，不要把脚本推算当成真实 Whistle 状态。

先进入当前 skill 根目录，再运行相对路径命令；不要在回答中硬编码本机 skill 安装路径。

```sh
# 只列出条目
node scripts/whistle-storage-edit.js --type rules --action list

# 读取条目
node scripts/whistle-storage-edit.js --type rules --action read --name test

# dry-run 写入，不落盘
node scripts/whistle-storage-edit.js --type rules --action write --name test --content "www.example.com http://localhost:5173"

# 真正写入，会先备份；必须用户明确要求，且检测到 Whistle 运行时默认拒绝
node scripts/whistle-storage-edit.js --type rules --action write --name test --content "www.example.com http://localhost:5173" --write --i-understand-storage-layout

# 追加到已有条目
node scripts/whistle-storage-edit.js --type rules --action write --name test --append --content "www.example.com/api resCors://*" --write --i-understand-storage-layout

# 指定 storage
node scripts/whistle-storage-edit.js --type values --action write --name user.json --content '{"id":1}' --storage dev --write --i-understand-storage-layout
```

写入原则：

1. 真实 rules/values 写入依赖用户机器状态，不能用沙箱结果代表真实环境。
2. 默认只 dry-run，确认目标条目、路径、字节数，不直接落盘。
3. 真正写入必须用户明确要求，并加 `--write --i-understand-storage-layout`。
4. 运行中写入可能被 UI 缓存覆盖；默认拒绝，除非用户明确接受并使用 `--allow-running`。
5. 每次写入默认备份整个 `rules` 或 `values` 目录。
6. 写入后让用户重启 Whistle 或在 UI 中确认条目内容。

## 3. 规则语法校验

生成规则后先 lint：

```sh
node scripts/whistle-rule-lint.js --text "www.example.com proxy://localhost:5173"
node scripts/whistle-rule-lint.js --file /path/to/rules.txt
node scripts/whistle-rule-lint.js --file /path/to/rules.txt --json
```

lint 能发现：

- 缺少 operation。
- `proxy://localhost` 被误用于本地服务转发。
- JSON mock 未用 `file://({...})`。
- `responseFor://({...})` 被误用于响应体 mock。
- `pathReplace://^/api=...` 把不含开头 `/` 的 path 当成完整 URL path。
- `file://` 路径不像 `file:///abs/path`、Values 或 temp。
- CORS 响应头写到 `reqHeaders://`。
- 注入规则缺少 `safeHtml/strictHtml`。
- pattern 过宽。

lint 不是官方解析器。它用于发现高频错误；通过 lint 也仍需在 Network/Overview 验证。回答里不要写“lint 通过所以语法正确”，只能写“未发现内置高频风险”。

## 4. 基于现有 rules 最小修改

用户说“帮我在现有配置里加/改”时，按这个流程：

1. 读取 `references/file-paths.md`，定位当前 storage。
2. 优先让用户在 UI 打开目标 Rules/Values 条目，或由用户提供当前内容。
3. 如果用户明确允许读本地 storage，在真实环境列出条目：

```sh
node scripts/whistle-storage-edit.js --type rules --action list
```

4. 读取目标条目：

```sh
node scripts/whistle-storage-edit.js --type rules --action read --name <entry>
```

5. 找到最小插入位置：

- 同域名规则放在同域名附近。
- mock 或临时调试规则优先放到独立条目，避免污染主规则。
- 宽规则放后面前要检查是否覆盖已有窄规则。
- 同 protocol 会被覆盖时，优先缩窄 pattern，而不是滥用 `lineProps://important`。

6. 先人工自检新内容；可选运行 lint 只发现高频风险。
7. dry-run 写入。
8. 用户确认后才 `--write --i-understand-storage-layout`。
9. 给验证和回滚方式。

## 5. 常见需求交付模板

### API Mock

输出：

```txt
Rules:
www.example.com/api/user statusCode://200
www.example.com/api/user resType://json
www.example.com/api/user file://{user.json}
```

```json
Values: user.json
{"id":1,"name":"mock"}
```

验证：Replay `https://www.example.com/api/user`，确认响应状态、Content-Type 和 body。风险：缓存、Service Worker、真实请求 path 不一致。

### 线上页面走本地

```txt
www.example.com http://localhost:5173 excludeFilter://*/api excludeFilter://*/static
```

验证：主文档命中本地服务，API 不命中本地。风险：过宽 host 规则影响子资源。

### 本地替换 JS

```txt
www.example.com/assets/app.js file:///Users/me/project/dist/app.js
```

验证：Network 中该 JS 的 Overview 命中 `file`，响应内容是本地文件。风险：hash 文件名、浏览器缓存、source map。

### 改请求头

```txt
www.example.com/api reqHeaders://x-debug=1
```

验证：Network 请求详情里看 request headers。风险：预检请求、服务端覆盖或忽略。

### 修复 CORS

```txt
www.example.com/api resCors://*
```

带 credentials 时改用精确响应头，不要用 `*`。

### HTTPS 只有 Tunnel

交付不是规则优先，而是步骤优先：

1. 真实环境确认代理经过 Whistle。
2. HTTPS 面板开启 capture。
3. 客户端安装并信任根证书。
4. 如果是 IP HTTPS，再尝试 `enable://captureIp`。
5. 如果是 pinning，使用 `disable://capture` 或测试包。

## 6. 回滚和禁用

优先使用低风险回滚：

- Rules 面板注释新增规则：行首加 `#`。
- 禁用新增 Rules 分组。
- 删除 Values 中新增 key。
- 恢复脚本生成的备份目录。
- `w2 proxy 0` 关闭系统代理。
- 对敏感域名加 `disable://capture`。

建议新增规则时加标记注释：

```txt
# codex-whistle: local-debug 2026-06-01
www.example.com http://localhost:5173
```

限制影响范围：

```txt
www.example.com/api http://localhost:3000 includeFilter://clientIp:192.168.1.23
www.example.com/api statusCode://500 includeFilter://chance:0.1
```

恢复备份示例：

```sh
w2 stop
# 将 rules.bak-* 或 values.bak-* 复制回原目录
w2 start
```

不要在未确认 storage 的情况下恢复备份，避免覆盖其他实例。
