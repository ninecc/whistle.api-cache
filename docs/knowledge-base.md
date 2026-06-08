# whistle.api-cache 知识库入口

本文是项目知识体系的导航入口。需要查具体细节时，优先进入 `docs/knowledge/` 下对应主题；遇到通用 Whistle 规则或插件框架问题，优先使用 `skills/whistle` 与 `skills/whistle-plugin`，不要在项目知识库里复制一份会过期的通用手册。

## 知识分层

| 层级 | 文档 | 关注点 |
| --- | --- | --- |
| 插件运行时基础 | `docs/knowledge/plugin-runtime.md` | 本项目使用到的 hook 生命周期、运行态数据来源、真实链路与测试链路差异。 |
| 插件框架基础 | `docs/knowledge/plugin-framework.md` | 本项目采用的插件框架决策，以及应该回到 `skills/whistle-plugin` 查询的通用能力。 |
| 当前项目技术知识 | `docs/knowledge/project-technical.md` | `whistle.api-cache` 的缓存模型、关键模块、数据流、存储、UI API、测试覆盖。 |
| 维护与排障 | `docs/knowledge/maintenance-playbook.md` | 常见故障、验证命令、已知边界、防劣化规则、扩展时必须同步检查的点。 |

## 知识来源优先级

1. 本项目代码与测试：确认 `whistle.api-cache` 当前真实行为。
2. `skills/whistle-plugin`：确认插件 hook、`lack`、`whistleConfig`、插件 UI、发布和插件加载排障。
3. `skills/whistle`：确认普通 Rules/Values、抓包、证书、代理、运行状态和 Whistle UI 操作。
4. 官方文档：当 skill 未覆盖或涉及版本差异时再查。

项目知识库只记录“本项目如何取舍和实现”。如果内容只是 Whistle 通用语法、插件 API 全量说明、`w2` 命令手册或证书安装步骤，应放回对应 skill 或引用 skill，不在这里展开。

## 快速定位

- 想确认 `server`、`rulesServer`、`resStatsServer` 的职责差异：看 `plugin-runtime.md`。
- 想确认为什么包名是 `whistle.api-cache`、如何用 `lack watch` 调试：看 `plugin-framework.md`。
- 想改缓存命中、请求体、TTL、导入导出、UI API：看 `project-technical.md`。
- 想排查未录制、未命中、自动模式重复访问上游：看 `maintenance-playbook.md`。

## 项目定位

`whistle.api-cache` 是一个 Whistle 插件，用于录制接口响应，并在后续调试请求中从本地缓存回放响应。

当前功能闭环：

- 通过 Whistle 规则显式选择录制、回放或自动模式。
- 录制符合策略的 `GET`、`POST` 接口响应。
- 回放命中缓存时返回本地响应，未命中时放行真实请求。
- 提供插件 UI 管理缓存、诊断事件、忽略 query 参数、导入导出和 TTL。
- 在 Whistle Network 列中通过 `x-whistle-cache` 标记回放命中。

包名使用 `whistle.api-cache`，避免和 Whistle 内置 `cache` 协议冲突。

## 项目知识维护规则

- 新增 Whistle 运行态、hook 生命周期、规则链路等通用知识，写入 `docs/knowledge/plugin-runtime.md`。
- 新增 `lack`、插件包结构、调试发布、插件 UI 框架等通用知识，写入 `docs/knowledge/plugin-framework.md`。
- 新增本项目模块职责、缓存策略、数据结构、接口行为等技术知识，写入 `docs/knowledge/project-technical.md`。
- 新增排障经验、验证命令、已知边界、扩展注意事项，写入 `docs/knowledge/maintenance-playbook.md`。
- 新增通用 Whistle 规则或插件框架知识前，先检查 `skills/whistle` 与 `skills/whistle-plugin`；若 skill 已覆盖，只在本项目文档中保留一句项目化结论或引用。
- 旧的阶段性需求和实施计划仍保留在 `docs/superpowers/`；已经落地并需要长期维护的内容，应沉淀到上面的知识分层中。
