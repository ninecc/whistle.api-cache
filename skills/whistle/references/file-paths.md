# Whistle 本地文件路径

用于定位、读取、备份或批量修改 Whistle 的 Rules、Values、证书、临时文件、插件和运行配置。路径规则来自 Whistle 源码中的 `lib/config.js`、`lib/rules/storage.js`、`lib/util/common.js`、`bin/util.js`。

## 路径读取上下文

Whistle 路径分两类：

- **可推算路径**：根据 Whistle 默认规则、`WHISTLE_PATH`、`-D/--baseDir`、`-S/--storage` 计算出来的候选路径。可以在沙箱中用脚本推算。
- **真实当前路径/内容**：当前正在运行的实例、真实系统代理、真实 `rules/values` 文件内容、证书目录、插件目录。必须在用户真实环境读取，不能把沙箱结果当作当前状态。

使用规则：

1. `scripts/whistle-paths.js` 默认只是路径推算，不证明该实例正在运行或这些文件就是当前 UI 正在使用的配置。
2. `scripts/whistle-storage-list.js` 会读取本机文件系统；如果在沙箱中运行，只能说明沙箱可见的文件，不能保证等于用户当前 Whistle 实例。
3. 要确认当前实例使用哪个 storage，优先在真实环境执行 `w2 status --all` 或查看 Whistle Client 设置。
4. 要直接写 `rules/values`，先确认目标实例已停止或用户接受运行中写入可能被覆盖的风险。

## 优先使用脚本定位

Skill 自带脚本。先进入当前 skill 根目录，再运行相对路径命令；不要在回答中硬编码本机 skill 安装路径。

```sh
node scripts/whistle-paths.js
node scripts/whistle-paths.js --storage dev
node scripts/whistle-paths.js --json
node scripts/whistle-storage-list.js --type rules
node scripts/whistle-storage-list.js --type values --json
node scripts/whistle-storage-edit.js --type rules --action list
node scripts/whistle-rule-lint.js --text "www.example.com http://localhost:port"
```

如果用户通过 `WHISTLE_PATH`、`-D/--baseDir`、`-S/--storage`、`--dataDirname`、`--name/whistleName` 启动过 Whistle，必须先确认启动参数或 `w2 status --all`，不要只看默认目录。

## 默认路径规则

Whistle 的全局根目录：

```txt
$WHISTLE_PATH
```

如果没有设置 `WHISTLE_PATH`，默认：

```txt
~/.WhistleAppData
```

默认 CLI 数据目录：

```txt
~/.WhistleAppData/.whistle
```

默认核心目录：

```txt
~/.WhistleAppData/.whistle/rules
~/.WhistleAppData/.whistle/values
~/.WhistleAppData/.whistle/properties
~/.WhistleAppData/temp_files
~/.WhistleAppData/custom_plugins
~/.WhistleAppData/custom_certs
~/.WhistleAppData/saved_sessions
~/.WhistleAppData/dev_plugins
```

运行状态配置文件在：

```txt
~/.startingAppData/%23
```

带 `-S dev` 的 storage 状态文件类似：

```txt
~/.startingAppData/%23dev%23
```

## storage 路径

`w2 start -S dev` 或 `w2 start --storage dev` 会把当前配置存储到 custom storage：

```txt
~/.WhistleAppData/.whistle/custom_dirs/dev
```

对应目录：

```txt
~/.WhistleAppData/.whistle/custom_dirs/dev/rules
~/.WhistleAppData/.whistle/custom_dirs/dev/values
~/.WhistleAppData/.whistle/custom_dirs/dev/properties
```

`storage` 名称会做 `encodeURIComponent`，所以包含空格、斜杠、中文或特殊字符时，磁盘目录名可能被编码。优先用脚本计算，不要手写。

## baseDir 和 WHISTLE_PATH

`WHISTLE_PATH` 改的是 Whistle 全局根目录：

```sh
WHISTLE_PATH=/data/whistle w2 start
```

默认数据目录变为：

```txt
/data/whistle/.whistle
/data/whistle/temp_files
/data/whistle/custom_plugins
/data/whistle/custom_certs
```

`-D/--baseDir` 改的是配置存储根路径。源码会对 `~/xxx` 做 home 展开：

```sh
w2 start -D ~/my-whistle-data
```

实际 rules/values 通常位于：

```txt
~/my-whistle-data/rules
~/my-whistle-data/values
~/my-whistle-data/properties
```

如果同时使用 `-D` 和 `--dataDirname`，实际 base 会拼上 `dataDirname`。遇到这种情况必须根据启动参数计算或查看运行配置。

## whistleName / 多实例

命名实例会放在：

```txt
~/.WhistleAppData/all_whistles/<whistleName>
```

对应：

```txt
~/.WhistleAppData/all_whistles/<whistleName>/rules
~/.WhistleAppData/all_whistles/<whistleName>/values
~/.WhistleAppData/all_whistles/<whistleName>/properties
~/.WhistleAppData/all_whistles/<whistleName>/custom_plugins
~/.WhistleAppData/all_whistles/<whistleName>/custom_certs
~/.WhistleAppData/all_whistles/<whistleName>/saved_sessions
```

多实例时，必须确认要修改哪个实例的 storage。不要把默认实例 rules 写到命名实例里。

## rules 和 values 的文件结构

`rules` 和 `values` 都使用同一套 Storage 结构。

以默认 rules 为例：

```txt
~/.WhistleAppData/.whistle/rules/
  files/
    0.%E9%BB%98%E8%AE%A4
    1.test
  properties
  .backup/
    properties
    0.%E9%BB%98%E8%AE%A4
  .recycle_bin/
```

以默认 values 为例：

```txt
~/.WhistleAppData/.whistle/values/
  files/
    0.user.json
    1.headers.txt
  properties
  .backup/
  .recycle_bin/
```

说明：

- `files/` 下每个文件保存一个 Rules 或 Values 条目的内容。
- 文件名格式是 `<index>.<encodeURIComponent(name)>`。
- `properties` 是 JSON，包含 `filesOrder` 等 UI 排序和属性。
- `.backup/` 是备份。
- `.recycle_bin/` 保存删除内容。
- group 也是一个条目，通常内容为空，不要随意删除。

## 读 rules/values

安全读取流程：

1. 先定位当前 storage 的 `rulesDir` 和 `valuesDir`。
2. 读取 `properties` 获取 `filesOrder`。
3. 遍历 `files/`，按 `<index>.<encodedName>` 解码名称。
4. 按 `filesOrder` 排序，拼出 UI 中看到的顺序。

快速人工查看：

```sh
ls ~/.WhistleAppData/.whistle/rules/files
cat ~/.WhistleAppData/.whistle/rules/properties
cat ~/.WhistleAppData/.whistle/values/properties
```

不要只按文件名排序推断 UI 顺序；优先看 `properties.filesOrder`。

推荐用只读脚本查看条目到磁盘文件的映射：

```sh
node scripts/whistle-storage-list.js --type rules
node scripts/whistle-storage-list.js --type values --storage dev
node scripts/whistle-storage-list.js --type values --json
```

输出中的 `filePath` 才是可以读取具体内容的文件路径。

## 写 rules/values

优先级：

1. UI Import/Export。
2. Rules/Values 面板直接编辑。
3. `w2 add` 导入规则。
4. 停止 Whistle 后直接改磁盘文件，再重启。

直接写磁盘时注意：

- 正在运行的 Whistle 会缓存 rules/values，直接改文件不一定立即生效，也可能被 UI 后续保存覆盖。
- 新增条目要同时写 `files/<index>.<encodedName>` 和更新 `properties.filesOrder`。
- 修改已有条目只改对应 `files/*` 相对安全，但仍建议先备份并重启。
- 删除条目要同步 `properties.filesOrder`，否则 UI 可能出现异常。
- 不要手动改 `.backup` 或 `.recycle_bin`，除非是在恢复数据。

推荐流程：

```sh
w2 stop
cp -R ~/.WhistleAppData/.whistle/rules ~/.WhistleAppData/.whistle/rules.bak
cp -R ~/.WhistleAppData/.whistle/values ~/.WhistleAppData/.whistle/values.bak
# 修改 files/ 和 properties
w2 start
```

## Values 中的文件路径引用

规则里的 `protocol://value` 有几类间接引用：

```txt
protocol://{key}             # 引用 Values 或内嵌 key
protocol://https://...       # 远程 URL
file:///Users/me/a.json      # 本地文件路径，file 协议必须是三个斜杠
protocol://temp.json         # 临时文件
```

如果要把路径本身当作字面值，而不是读取该路径，用小括号：

```txt
reqHeaders://(/Users/me/not-a-file)
file://({"ok":true})
```

本地文件映射：

```txt
www.example.com/api/user file:///Users/me/mock/user.json
www.example.com/static file:///Users/me/project/dist/static
```

文件内容小于 2KB 可内联或嵌入；2KB 到 200KB 适合 Values；更大内容建议用本地文件。

## 临时文件

Whistle 临时文件根目录：

```txt
~/.WhistleAppData/temp_files
```

在 Rules 编辑器中按住 Command/Ctrl 点击 `protocol://temp.xxx` 后保存，Whistle 会把规则改成类似：

```txt
file://temp/<hash>.html
```

这些内容由 Whistle 管理，适合频繁临时编辑；长期配置建议放 Values 或真实项目文件。

## 证书路径

自定义证书目录：

```txt
~/.WhistleAppData/custom_certs
```

命名实例：

```txt
~/.WhistleAppData/all_whistles/<whistleName>/custom_certs
```

启动参数 `-z/--certDir` 可指定自定义证书目录。遇到 HTTPS 证书问题时，同时检查 HTTPS 面板、系统证书信任和该目录。

## 插件路径

常见目录：

```txt
~/.WhistleAppData/custom_plugins
~/.WhistleAppData/dev_plugins
```

命名实例：

```txt
~/.WhistleAppData/all_whistles/<whistleName>/custom_plugins
```

启动参数可能影响插件路径：

```txt
--pluginPaths / --pluginsPath / --pluginPath
--customPluginPaths / --customPluginsPath / --customPluginPath
--projectPluginPaths / --projectPluginsPath / --projectPluginPath
--addon
```

插件问题不要只看默认目录，先看启动参数和 Plugins 面板。

## Whistle Client 注意事项

桌面 Whistle Client 可能使用独立存储目录，也可能设置为使用 CLI 默认存储目录。处理 Client 时：

1. 先看客户端设置中是否启用 “Use whistle's default storage directory”。
2. 未启用时，不要假设 rules/values 在 `~/.WhistleAppData/.whistle`。
3. 优先通过 UI Export/Import 或客户端设置定位。

## 快速路径表

```txt
全局根目录:        ${WHISTLE_PATH:-~/.WhistleAppData}
默认数据目录:      <root>/.whistle
默认 rules:        <root>/.whistle/rules
默认 values:       <root>/.whistle/values
默认 properties:   <root>/.whistle/properties
storage rules:     <root>/.whistle/custom_dirs/<encode(storage)>/rules
storage values:    <root>/.whistle/custom_dirs/<encode(storage)>/values
临时文件:          <root>/temp_files
自定义证书:        <root>/custom_certs
自定义插件:        <root>/custom_plugins
开发插件:          <root>/dev_plugins
保存会话:          <root>/saved_sessions
运行状态:          ~/.startingAppData/%23<storage?>%23
```
