---
name: codex-manager
description: Use when the user asks about plugin/skill/MCP usage statistics (插件使用量、使用统计、使用报表、哪个插件用得多、MCP 调用次数), wants to export a usage spreadsheet (导出表格、Excel 报表), wants a work session turned into a flowchart (工作流程图、会话复盘、把这次工作画成流程图), wants to visually edit a flowchart on a canvas (可视化编辑流程图、拖拽改图、画布上改流程图、浏览器里修改流程图), wants to review or improve a work process (流程审查、流程提问、哪些可以省、哪些可以优化、流程改进), wants an end-of-project retrospective with prompt recommendations (项目总结、优化提示词), wants personal habits turned into a skill (个人习惯成 skill、总结成技能), wants a project flow framework built up or aggregated (流程框架、持续搭建、最后汇总), or wants multi-agent / cross-agent review (子智能体审查、跨智能体总结). Backed by automatic usage-logging hooks and the /codex-* commands.
---

# Codex Manager：用量统计、流程审查与持续改进

数据来源：本插件的钩子把每次技能（Skill 工具）调用、MCP 工具调用和会话开始自动追加到
`%USERPROFILE%\.zcode\codex-manager\usage.jsonl`，每行一个 JSON：`ts / kind(skill|mcp|session) / plugin / name / session / cwd`。
项目流程框架（人可编辑）在 `%USERPROFILE%\.zcode\codex-manager\projects\<项目名>\flow.json`。

## 命令路由（按用户意图分发）

| 用户意图 | 执行 |
| --- | --- |
| 使用量 / 统计 / 报表 / 表格 | `/codex-usage`（读日志 → 聚合 → Markdown 表格 + xlsx） |
| 流程图 / 把这次工作画出来 | `/codex-flow`（当前会话直接梳理；历史会话解析 rollout） |
| 可视化编辑 / 拖拽改图 | `/codex-flow-edit`（浏览器画布编辑 → 导出 .mmd → 可用 `/codex-flow-save` 回写框架） |
| 流程审查 / 提问 / 哪些可省可优化 | `/codex-review`（提问式审查 → 类型化推荐表） |
| 项目结束 / 总结 / 优化提示词 | `/codex-optimize`（复盘报告 + 可复用提示词模板） |
| 个人习惯 / 总结成 skill | `/codex-habit`（数据驱动提炼 → 自主编写 SKILL.md） |
| 存进项目框架 / 持续搭建 | `/codex-flow-save`（合并进 flow.json，支持渲染图片） |
| 多个子智能体审查 / 跨智能体总结 | `/codex-agents-review`（3 子智能体并行 → 总智能体汇总 → 沉淀） |
| 最后汇总 / 项目总报告 | `/codex-summary`（总流程图 + 审查闭环报告） |

## 规则

- 只报告真实记录的数据，不编造。日志为空或不存在时如实说明，并提示数据会随使用自动积累。
- 生成的报表/流程图/报告保存到当前工作区或 `projects\<项目名>\`，并在回复中给出完整路径。
- 用户没装 openpyxl 时降级为 CSV，不要安装依赖。
- 流程框架 `flow.json` 是用户可手工编辑的文件：读取时以文件为准，写回时合并而不是覆盖未知字段。
- 审查与汇总结论必须引用真实事件/记录；证据不足时如实标注，不硬造建议。

## 多智能体接入（v0.21.0 起，v0.23.0 增强）

`flow_serve.py` 用「适配器注册表」统一接入所有智能体，不再硬编码单一客户端。
每次启动会打印 `已注册智能体 N 个` 与各自的连接状态。

**v0.23.0 关键行为**（修复「只显示 ZCode / 重开清空记录 / 同步节点过少」）：
- **问答同步按全量会话**：编辑器 `loadHttpQa` 对每个客户端同步**全部会话**（手动/首次载入上限 `QA_SYNC_CAP_FULL=200`，6 秒自动轮询只补最新 `QA_SYNC_CAP_AUTO=12`），不再只取最新 1 个。
- **单客户端隔离**：逐个客户端 try/catch，任一客户端异常（如 gemini 缺 rel、文件损坏）不再中断其余客户端同步。
- **多格式解析器**：`parseAnyTurns` 新增 `parseWbTurns` / `parseGeminiTurns` / `parseQwenTurns`，把各客户端原始日志解析为统一问答回合（`{q,a,tools,ts}`）：
  - WorkBuddy：`{type:'message', role, content:[{type:'input_text'|'output_text', text}], timestamp}`。
  - Gemini：`USER_INPUT`（正文在 `<USER_REQUEST>…</USER_REQUEST>`）+ `PLANNER_RESPONSE`（`thinking` / `tool_calls`）+ `GENERIC`（`content`）。
  - Qwen：`.runtime.json` 仅元信息 → 登记 1 个会话节点并如实标注「不含对话正文」。
- **gemini 免 rel**：`gemini_content_path` 在未传 `rel` 时自动定位 `.system_generated/logs/transcript.jsonl`。
- **Token 不锁死**：`loadHttpClientUsage` 失败后可 8 秒自动重试；多客户端未载入时 `tokList()` 返回空（显示加载/重试态），不再退化显示「只有 ZCode」。
- **重播种保留会话画布**：rev 变化时保留所有 `src.session` 会话画布与用户手工画布（名字不冲突即保留），不再因工作副本重生成而清空历史。

**已内置的智能体适配器**（按 `ADAPTERS` 顺序）：

| id | 名称 | 数据目录（默认） | 会话形态 | 令牌 |
| --- | --- | --- | --- | --- |
| `zcode` | ZCode | `~/.zcode/cli/rollout` | `model-io-sess_*.jsonl` 扁平文件 | ✅ |
| `codex` | Codex CLI | `~/.codex/sessions` | `YYYY/MM/DD/rollout-*.jsonl` | ✅ |
| `qoder` | Qoder CLI | `~/.qoder-cn` | `projects/<项目>/<会话>.jsonl` + `subagents/` | ❌ 无令牌字段 |
| `gemini` | Gemini (Antigravity) | `~/.gemini/antigravity` | `brain/<uuid>/` 目录树 | ❌ 无令牌字段 |
| `wb` | WorkBuddy | `~/.workbuddy` | `projects/<项目>/<会话>.jsonl` | ✅ |
| `qwen` | Qwen Code | `~/.qwen` | `projects/<项目>/chats/<uuid>.runtime.json` | ❌ 仅元信息 |
| `kimi` | Kimi | `~/.kimi-work` | 无（目录内只有可执行文件） | ❌ 无数据 |

各适配器令牌口径说明：
- **zcode / codex / wb** 有令牌明细，口径统一为「输入 = 净输入（已扣除缓存读）+ 缓存读 + 输出 = 合计」。
  - Codex：`cached_input_tokens` 是 `input_tokens` 的子集，展示时拆出。
  - WorkBuddy：取 `providerData.usage.{inputTokens,outputTokens,totalTokens}`，缓存读取 `inputTokensDetails[].cached_tokens`。
- **qoder / gemini / qwen / kimi** 本地日志无令牌字段，只统计调用次数或会话数，并在 `note` 中如实标注。

**WorkBuddy 适配器细节**：会话文件含完整对话（`type` = message / function_call / reasoning / ai-title 等），
模型名取 `providerData.model`，令牌取 `providerData.usage`。本机实测识别出 deepseek-v4.1-flash、
kimi-k3-1、glm-5.3、minimax-m3 等模型。**v0.23.0 起**其 `message` 记录会被 `parseWbTurns` 解析为问答节点
（本机实测单会话即产出 66 条问答），显著增加画布流程节点。

**Qwen Code 适配器细节**：`chats/<uuid>.runtime.json` 只写运行时会话元信息
（session_id / work_dir / started_at / qwen_version），**不含对话正文**，故只提供会话清单。

**Kimi**：桌面版 `~/.kimi-work` 下只有 `bin/`（可执行文件），没有任何会话存储，
注册表中会显示为「无会话」状态——这是如实标注，不是故障。

**相关端点**：
- `GET /__flow_agents_registry` → 「已连接智能体」分类视图（连接状态 connected/empty/missing + 对话画布统计）
- `GET /__flow_clients` → 各智能体的会话明细（含子智能体，字段带 `group` 分组与 `error`）
- `GET /__flow_client_file?client=&id=&rel=&tail=` → 读会话正文（gemini 需带 `rel` 指定正文相对路径）

**编辑器「🔌 已连接智能体」视图**：按「智能体 → 对话画布」两级分类——上层是各智能体卡片
（连接状态徽章、令牌能力、数据目录、最近活跃），下层是它的会话（🧠 主会话）与子智能体（🤖），
每行可「→ 看问答」转跳问答视图并按该客户端过滤。

**新增一个智能体的步骤**：
1. 写探测函数：`list_xxx_sessions(dir, limit)` 返回会话列表（含 `id/name/session/mtime/file/sub`），
   以及可选的 `scan_xxx_usage(dir, limit)` 返回用量聚合 dict；
2. 在 `ADAPTERS` 里加一条 `_adapter("xxx", "显示名", "xxx_dir", lister, usage, tokens=..., group=...)`；
3. 若需要独立可配置目录：`default_paths()` 加一项、`SETTINGS_KEYS`/`KEY_ATTR` 加键、`Handler` 加类属性、
   `main()` 加 `--xxx` 参数（注意 default_paths 的元组解包要同步加位）、`settings_view()` 的 exists 判断自动生效；
4. `client_session_path()` 加该 id 的路径解析（须做 `os.path.commonpath` 越界校验）；
5. 前端 `flow-editor.html`：`QA_CLIENTS` 加色板、`SET_KEYS` 加键、`setLabel()` 加标签、I18N 补英文。

## Gemini / Antigravity 重要说明

- 一个会话 = `brain/<uuid>/` 一个**目录**（不是单文件），正文在 `.system_generated/logs/transcript.jsonl`。
- **transcript 不含任何令牌字段**（实测只有 `step_index/type/status/created_at/content/thinking`），
  故该适配器 `tokens=False`，只按模型响应步数（`PLANNER_RESPONSE` 等）统计调用次数——**不编造 token 数**。
- 模型名从 `USER_INPUT` 正文的 `<USER_SETTINGS_CHANGE>`（“Model Selection … to X”）尽力提取；
  提取不到时如实标为 `Gemini (未标注)`。
- 若将来版本加入 `usageMetadata`/`promptTokenCount`，解析器会自动识别并把 `tokens` 翻成 `true`。

