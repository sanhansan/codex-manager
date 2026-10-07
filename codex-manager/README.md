# Codex Manager（Codex 管家）

ZCode 插件 · ZCode plugin · v0.24.1

[English](#english) | [简体中文](#中文)

一个用于管理 Codex 工作台的 ZCode 插件：自动看见其他插件的使用量、一键调出 Excel 用量表格、把每次工作会话转化为 Mermaid 流程图并在浏览器画布上可视化编辑。画图不是目的——流程图让审查与修改变得可见：对照图发现绕路与重复，改进下一次工作。当前版本 **v0.24.1**，由 [@sanhansan](https://github.com/sanhansan) 维护。

---

## 中文

### zip 安装包使用方法

1. 打开 [Releases](https://github.com/sanhansan/codex-manager/releases) 页面，下载最新版的 `codex-manager-vX.Y.Z.zip`（当前 **v0.24.1**）；
2. 解压，得到 `codex-manager/` 目录（内含 `marketplace.json` 和本插件源码 `codex-manager/`）；
3. 打开 ZCode → **插件市场 → 添加 → 添加插件市场** → 选择解压出的 `codex-manager` 目录（含 `marketplace.json` 的那一层）；
4. 在 **个人** 页找到 **Codex Manager** → 点击 **安装**；
5. 新建任务，输入下述命令即可使用。

> 也可以不走安装包：`git clone https://github.com/sanhansan/codex-manager.git` 后，把克隆出的目录按第 3 步添加，效果相同，且更新更及时。

### 功能与命令

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| 看见其他插件的使用量 | 自动 | 钩子把每次技能调用、MCP 调用、会话开始追加到 `%USERPROFILE%\.zcode\codex-manager\usage.jsonl` |
| 一键调出表格 | 命令 `/codex-usage` | 聚合用量并生成带样式的 Excel（`codex-usage-<时间>.xlsx`），同时在对话中给出 Markdown 表格；可选参数：统计最近 N 天 |
| 工作转化为流程图 | 命令 `/codex-flow` | 当前会话直接梳理成 Mermaid 流程图；参数 `recent` 或会话 ID 可复盘历史会话（读取 `%USERPROFILE%\.zcode\cli\rollout\model-io-sess_*.jsonl`），产物为 `codex-flow-<时间>.md` |
| 可视化编辑流程图 | 命令 `/codex-flow-edit` `[文件或项目名]` | 左侧任务栏八视图（🖼 画布 / 🔌 已连接智能体 / 🛰 分布工作区 / 🧭 总控流程 / 🧩 Agent Skills / 📜 轨迹查询 / 💬 问答 / 🧠 智能体神经网络）、中英双语界面、多工作流、节点类型与就地编辑、画布「＋框架」一键插骨架、八类逻辑门、三页签双向同步、**HTTP 零点击双向文件同步且断线 4 秒自动重连**（flow_serve.py）、AI 校验与提案；🧩 Agent Skills 含 **🛠 Skill 工坊**（从习惯候选或问答/提示词生成 SKILL.md 草稿 → 编辑 → 导出 → 保存/安装，装进插件的技能可被智能体用 Skill 工具直接调用）；📜 轨迹查询按关键字/类型/会话回放；🔌 已连接智能体按「智能体 → 对话画布」分类呈现 7 家连接状态；💬 问答**多客户端自动同步**（**全部会话**+全部子智能体，覆盖 ZCode / Codex CLI / Qoder CLI / Gemini / WorkBuddy / Qwen / Kimi，6s 轮询，客户端色徽章）、关键词总览条点击过滤、提示词总结可复制/导出、**一键重点与提示词**、**一键生成工作画布**（🧠 总任务链 + 🤖 虚线挂载）；🧭 总控流程含使用量与 **多客户端 Token 看板**（ZCode / Codex CLI / WorkBuddy 有令牌明细）（按日/按月切换、悬停看各客户端分解、点数据点出周期明细并转跳问答、客户端模型用量、按插件归属与按会话明细）；导出后可用 `/codex-flow-save` 回写框架 |
| 流程提问审查 | `/codex-review` `[项目名]` | 7 类审查问题自问自答，输出【可省/可优化/保留/习惯】推荐，每条附事件依据 |
| 项目结束总结 | `/codex-optimize` `[项目名]` | 复盘报告 + 吸收踩坑教训的优化提示词模板 |
| 习惯固化成 skill | `/codex-habit` `[主题] [install]` | 从用量与审查数据提炼个人习惯，自主编写 SKILL.md，可装进插件 |
| 项目流程框架 | `/codex-flow-save` → `/codex-agents-review` → `/codex-summary` | 同一项目持续搭建人可编辑的 flow.json（可渲染图片）；效率/质量/提示词三子智能体并行审查、跨智能体汇总；最后汇成总流程图与闭环报告 |

也支持自然语言触发："看看插件使用量""把这次工作画成流程图"。

### 组成

- `hooks/hooks.json` + `hooks/log-usage.mjs`：PostToolUse（Skill / mcp__*）与 SessionStart 钩子，静默写用量日志，绝不阻塞会话。
- `commands/`：9 个命令——`codex-usage`（用量报表）、`codex-flow`（流程图）、`codex-flow-edit`（可视化编辑）、`codex-review`（流程审查）、`codex-optimize`（项目总结）、`codex-habit`（习惯成 skill）、`codex-flow-save`（流程框架）、`codex-agents-review`（多智能体审查）、`codex-summary`（最终汇总）。
- `assets/flow-editor.html`：零依赖单文件可视化流程图编辑器（`/codex-flow-edit` 注入数据后在浏览器打开，离线可用）。
- `skills/codex-manager/SKILL.md`：自然语言触发入口。

### 数据与隐私

用量日志只包含：时间戳、类型、插件名、技能/工具名、会话 ID、工作目录。全部保存在本机 `~/.zcode/codex-manager/`，不联网上传，可随时删除。

---

## English

A ZCode plugin for managing your Codex workbench: see other plugins' usage automatically, bring up an Excel usage report with one command, and turn every work session into a Mermaid flowchart you can visually edit on a canvas. The diagram is not the goal — it makes review possible: spot detours and repeats against it, then improve the next run. Current version **v0.24.1**, maintained by [@sanhansan](https://github.com/sanhansan).

### How to use the zip package

1. Open the [Releases](https://github.com/sanhansan/codex-manager/releases) page and download the latest `codex-manager-vX.Y.Z.zip` (currently **v0.24.1**);
2. Unzip it — you get a `codex-manager/` folder containing `marketplace.json` and this plugin's source (`codex-manager/`);
3. Open ZCode → **Plugin Marketplace → Add → Add Plugin Marketplace** → select the extracted `codex-manager` folder (the one containing `marketplace.json`);
4. Under **Personal**, find **Codex Manager** → click **Install**;
5. Start a new task and use the commands below.

> Prefer source? `git clone https://github.com/sanhansan/codex-manager.git` and add the cloned folder as in step 3 — same result, always up to date.

### Features & commands

| Feature | Entry | Description |
| --- | --- | --- |
| See other plugins' usage | automatic | Hooks append every skill call, MCP call and session start to `%USERPROFILE%\.zcode\codex-manager\usage.jsonl` |
| One-click spreadsheet | `/codex-usage` | Prints a Markdown breakdown in chat and generates a styled Excel (`codex-usage-<timestamp>.xlsx`); optional argument = last N days |
| Session flowchart | `/codex-flow` | Outlines the current session as a Mermaid diagram; `recent` / a session-ID fragment replays past sessions (from `%USERPROFILE%\.zcode\cli\rollout\model-io-sess_*.jsonl`) into `codex-flow-<timestamp>.md` |
| Visual flowchart editor | `/codex-flow-edit` `[file or project]` | Left taskbar with eight views (🖼 canvas / 🔌 connected agents / 🛰 distributed workspaces / 🧭 master control / 🧩 Agent Skills / 📜 trace query / 💬 Q&A / 🧠 agent neural network), bilingual UI, multi-workflow, node kinds & in-place editing, canvas "＋skeleton", 8 logic gates, three synced tabs, **zero-click two-way file sync over HTTP with 4-second auto-reconnect** (flow_serve.py), AI validation & proposals; 🧩 Agent Skills ships a **🛠 skill workshop** (draft a SKILL.md from habits or from the loaded Q&A/prompts → edit → export → save/install; installed skills are callable by agents via the Skill tool); 📜 trace query replays every call by keyword/kind/session; 🔌 Connected agents view groups 7 clients as 「agent → conversation canvases」; 💬 Q&A **multi-client auto-sync** (**all sessions** + all sub-agents across ZCode / Codex CLI / Qoder CLI / Gemini / WorkBuddy / Qwen / Kimi, 6s polling, client color badges) with a click-to-filter keyword bar, a copyable/exportable prompt summary, **one-click highlights & prompts** and **one-click work canvas** (🧠 task chain + 🤖 dashed attachments); 🧭 master control carries usage & a **multi-client token board** (token detail on ZCode / Codex CLI / WorkBuddy) (day/month toggle, per-client hover breakdown, click-a-point period details with jump-to-Q&A, per-client model usage, per-plugin attribution, per-session drill-down); **canvases grouped by project** (project derived from session cwd → left panel 项目chip → agent frame → canvas), same-project 🧠 master and 🤖 sub agents boxed together, cross-agent 🤝 collaboration chains visible; **🧠 Agent Neural Network** compresses projects/sessions/knowledge into a zoomable chip brain-map (chip board + pins + neurons + synapses, 🔲 chip array / 🕸 neural ring / 🌳 knowledge tree layouts, scroll-zoom reveals text, click a neuron to jump to its canvas, pulses flow along synapses). Export flows back via `/codex-flow-save` |
| Question-driven process review | `/codex-review` `[project]` | 7 classes of review questions produce typed recommendations (omit/optimize/keep/habit), each with event evidence |
| End-of-project retrospective | `/codex-optimize` `[project]` | Retrospective report + prompt templates that absorb the project's pitfalls |
| Habits into skills | `/codex-habit` `[theme] [install]` | Distills habits from usage/review data, autonomously writes SKILL.md, installable into the plugin |
| Project flow framework | `/codex-flow-save` → `/codex-agents-review` → `/codex-summary` | Continuously build a human-editable flow.json (renderable images); efficiency/quality/prompt sub-agents review in parallel with cross-agent aggregation; final master flowchart and closed-loop report |

Natural language works too: "show plugin usage", "chart this session".

### Components

- `hooks/hooks.json` + `hooks/log-usage.mjs`: PostToolUse (Skill / mcp__*) and SessionStart hooks that silently append to the usage log — never blocking your session.
- `commands/`: 9 commands — `codex-usage` (usage report), `codex-flow` (flowchart), `codex-flow-edit` (visual editor), `codex-review` (process review), `codex-optimize` (retrospective), `codex-habit` (habits into skills), `codex-flow-save` (flow framework), `codex-agents-review` (multi-agent review), `codex-summary` (final aggregation).
- `assets/flow-editor.html`: dependency-free single-file visual flowchart editor (`/codex-flow-edit` injects data and opens it in a browser; works offline).
- `skills/codex-manager/SKILL.md`: natural-language trigger entry.

### Data & privacy

The usage log holds six metadata fields only (timestamp, type, plugin name, skill/tool name, session ID, working directory), stored locally at `~/.zcode/codex-manager/`, never uploaded; delete the file to wipe history.

---

## 版本历史 / Changelog

- **0.24.1**：**修复「任何选项点击都没反应」**。上一版的工作副本注入时，替换串里的 `\n` 被当成转义序列还原成**真换行**，把注入的 `PAYLOAD` JSON 撑成多行 → 整段 `<script>` 报 `Invalid or unexpected token` → 页面看似正常但**所有按钮/视图/弹窗点击都无响应**（事件监听器全都没绑上）。现①改用 `str.replace(marker, payload, 1)` 直接注入并在写盘前**断言 `const PAYLOAD = ...` 只占一整行**；②`commands/codex-flow-edit.md` 增加同款自检与「不要自己另写替换逻辑」的警示；③新增 **`tests/inject-guard.mjs`（4 项）**——校验注入后 PAYLOAD 不跨行、整段主 `<script>` 能被 `vm` 编译、`JSON.parse` 能还原原始 mermaid、含 `</script>` 的 mermaid 不会提前闭合标签。回归测试 **80 项** + 注入守卫 **4 项** + 端到端 **28 项** 全绿。
- **0.24.0**：**项目维度 + 智能体神经网络**。①**总控流程文字溢出修复**——长节点名按像素宽度截断（CJK≈1em / 西文≈0.56em）并逐节点加 `clipPath`，`#ctlTable` 改固定布局 + 单元格 `overflow-wrap:anywhere`，`.wfcard` 允许任意位置换行且标题省略号；②**画布按项目分组**——从会话 `cwd` 末段推导项目名并写入 `src.project`，左侧列表由三层树改为 **项目芯片 → 智能体大框 → 画布**；③**同项目智能体大框**——每个客户端一个彩色边框「智能体框」，标注 🧠 主智能体 + 🤖 N 子智能体；④**同项目跨智能体协作**——按时间序生成接力链（如 ZCode→Codex→Gemini）并在列表显示 🤝 协作链；⑤**「点击切换与展现」重做**——画布顶部面包屑（📁 项目 › 🤖 智能体 › 🧩 画布，点击展开下拉）+ 全局快速切换面板（🔎 关键字过滤、回车跳转）+ 切换淡入动效；⑥**新增「🧠 智能体总结神经网络」视图**——把项目 / 会话 / 知识压成可缩放芯片脑图：芯片底板 + 引脚 + 神经元 + 突触，三种布局（🔲 芯片阵列 / 🕸 神经网络环 / 🌳 知识树），滚轮缩放（放大后浮现文字）、拖拽平移、点击神经元跳转对应画布、悬停看详情、脉冲光点沿突触流动，右下 HUD 实时统计神经元 / 突触 / 项目数。回归测试 **80 项**（新增 6 项项目维度与神经网络纯函数）、端到端 28 项、i18n 0 缺失。
- **0.23.0**：修复三处反馈问题——①**Token 使用量此前只显示 ZCode**：多客户端能力可用但未载入时 `tokList()` 不再静默退化为「只有 ZCode」，改为显示加载/重试态，且 `loadHttpClientUsage` 失败后 **8 秒自动重试**（一次瞬时失败不再永久锁死）；②**重新打开会清空历史会话记录**：rev 变化重播种时**保留所有会话/对话画布（`src.session`）与用户手工画布**，不再因工作副本重生成而丢失；③**画布同步节点过少**：每个客户端由「只取最新 1 个会话」改为同步**全部会话**（手动/首载上限 200、6 秒轮询补最新 12），并新增 **WorkBuddy / Gemini / Qwen 三种会话格式解析器**（WorkBuddy `message`+`content[]`、Gemini `USER_INPUT`/`PLANNER_RESPONSE`/`GENERIC`、Qwen 运行时元信息登记为单节点）；同期修复 gemini 未传 `rel` 时自动定位 `transcript.jsonl`、**单客户端异常不再中断其余客户端同步**。本机实测：问答节点 68→**152**，载入会话 7→**62**（58 主会话 + 4 子智能体）。回归测试 74 项、i18n 585 用键 0 缺失。
- **0.22.0**：新增 **WorkBuddy / Qwen Code / Kimi** 三个适配器，注册表扩至 **7 家**——WorkBuddy 接 `~/.workbuddy/projects/<项目>/<会话>.jsonl`（完整对话 + `providerData.usage` 令牌明细 + 模型名，本机 23 会话 / 5341 万 token / 6 个模型）；Qwen Code 接 `~/.qwen/projects/<项目>/chats/<uuid>.runtime.json`（仅会话元信息）；Kimi 接 `~/.kimi-work`（仅可执行文件，如实标注无会话数据）；⚙ 设置扩至 **9 个数据源目录**；「🔌 已连接智能体」视图按 CLI / IDE / 桌面三组呈现 7 家连接状态。
- **0.21.0**：**多智能体适配器框架**——客户端不再硬编码，改为「适配器注册表」自动接入（`ADAPTERS` + `_adapter()`），新增 **「🔌 已连接智能体」分类视图**（按「智能体 → 对话画布」两级分类：连接状态徽章、令牌能力、数据目录、最近活跃；下层列出各自主会话与子智能体，可一键转跳问答并按该客户端过滤）；新增 `GET /__flow_agents_registry` 端点；接入 **Gemini / Antigravity** 目录树式会话（`brain/<uuid>/`，正文在 `.system_generated/logs/transcript.jsonl`，无令牌字段则如实按响应步数统计）；适配器扫描失败不再静默吞掉，而是如实报错。
- **0.20.0**：编辑器「科技朴素」视觉重写（中性灰阶、统一 2px 方角、去阴影、24px 工程细线网格、等宽数字、亮暗双主题）与克制的工程感动效（120–220ms；系统「减弱动态效果」时全量降级）；回归测试 71 项。
- **0.19.0**：工作流整树一键导出 / 导入（合并语义、兼容单画布 JSON）与**本地服务自动备份**（改动防抖 2.5 秒回传 `wf-backup.json`，rev 重播种或存档丢失后自动并回不冲突的画布）；画布 🤖 子智能体节点查看输出全文（含 Qoder）；小对话与节点耗时标注（距下一次提问）；**Token 费用估算**（⚙ 设置填模型单价，KPI / 客户端模型表 / 周期明细卡 / 折线图悬停四处显示）。
- **0.18.0**：**对话画布 + 三层工作流树**（主流程 → 对话画布 → 小对话，点击跳转定位）；导入会话生成独立对话画布；文件同步固定归属主流程。
- **0.17.0**：会话一键导入为独立对话画布（追加 🧠 任务链 + 🤖 虚线子智能体，可撤销，按需拉取原文）；⚙ 设置弹窗（`GET/POST /__flow_settings`，5 个数据源目录，仅绝对路径，CLI 参数优先并锁定，原子落盘即时生效）；空问答条目导入时跳过。
- **0.16.0**：编辑器 v7——**多客户端（ZCode / Codex CLI / Qoder CLI）**：`flow_serve.py` 新增 `/__flow_clients`（三家会话列表）、`/__flow_client_file`（按客户端读原文，tail 钳制）、`/__flow_client_usage`（三家用量聚合，口径统一「输入 + 缓存读 + 输出 = 合计」，Qoder 无令牌数如实标注）；🪙 Token 升级为多客户端看板（客户端筛选 chips、按日/按月切换、悬停看各客户端分解、点数据点出周期明细并可转跳问答、客户端模型用量）；💬 问答自动同步扩至三家（客户端色徽章），新增 **⚡ 一键重点与提示词**（自动打分，无需标注）与 **🖼 生成工作画布**（🧠 任务链 + 🤖 虚线挂载，可撤销）；画布同步自愈——断线提示 + **4 秒自动重连**，服务恢复自动续传；修复 `parseQaTurns` 只取最后窗口导致 tail/delta 分片会话解析为 0 条的 bug（改为按偏移合并全部窗口）；回归测试 56 项、i18n 451 用键 0 缺失。
- **0.15.0**：编辑器 v6——💬 问答自动同步（最新会话 + 全部子智能体，6s 轻量轮询、去重原地更新）、关键词总览条（🧠 任务 / 🤖 子智能体，点击即过滤）、中英双语提示词总结（复制 / 导出 .md）、「🧩 技能总结」更名 **「🧩 Agent Skills」** 并支持从问答/提示词生成 SKILL.md 草稿、⬇ 导出 SKILL.md、一键安装（智能体可用 Skill 工具调用）、画布「＋框架」一键插骨架、Token 每日折线图（悬浮显示当日用量）；回归测试 48 项、i18n 412 用键 0 缺失。
- **0.14.0**：编辑器 v5——中英双语界面（🌐 一键切换，偏好记忆）、🛠 Skill 工坊（习惯候选生成技能草稿 → 编辑 → 保存草稿 / 安装进插件）、节点就地编辑（双击节点 / F2 直接改标签）、前端页面优化。
- **0.13.0**：编辑器 v4——`flow_serve.py` HTTP 零点击自动连接（AI 改文件即重画、画布改动自动写回）、总控流程「📦 使用量」与「🪙 Token 使用量」区块（启动自动载入；Token 按插件归属与按会话明细，与总量逐位对账）、Codex CLI 用量报表增强（插件使用量 / 任务消耗）。
- **0.12.0**：Codex CLI 适配——插件使用量报表、任务消耗 Top 10 与 Excel「任务明细」Sheet、令牌口径修复（thread_token_usage，修复约 77 倍漏计）。
- **0.11.0**：编辑器新增「💬 问答」视图（总智能体 / 子智能体逐项展开，关键词、工具汇总、一键添加为画布节点；画布来源会话特别标注）。
- **0.10.0**：编辑器工作流化——节点类型系统（输入/Agent/Map/条件/合并/输出，标签后缀无损携带）、反馈连线与拖动改接、逻辑校验 v2、🧩 技能总结升为独立视图、轨迹查询、AI 优化连线。

- **0.9.0**：编辑器布局升级——① 新增**左侧任务栏**，「🖼 画布 / 🛰 分布工作区 / 🧭 总控流程」三视图手动切换，工作流列表点击即换；② 「总控」从弹窗升级为整页视图：新增**总控关系图**（每个工作流一个节点、虚线标子流程引用、按引用分层、点击节点进入对应工作区）+ 原有关系表；③ 「分布工作区」视图以卡片呈现每个工作流（节点/连线/门统计，打开/重命名/删除/导出）；④ **默认白色主题**，底部代码面板随主题变色（深色仍可一键切换）；⑤ 📊 习惯页新增**技能总结**：每个技能/MCP 的调用次数、占比、最近使用时间与汇总结论，Markdown 总结同步包含该表；⑥ 修复浏览器打开「拒绝访问」：`/codex-flow-edit` 增加本地 HTTP 服务兜底方案（127.0.0.1 绕开文件 ACL 限制）；重命名工作流时同步更新所有子流程引用。

- **0.8.0**：code↔网页实时同步 + 习惯可视化页——「🔗 连接文件」基于 File System Access API 把画布与本地 mermaid/Markdown/JSON 文件双向绑定：AI 或会话改文件 → 页面 1.5 秒内自动重画；画布改动 → 0.8 秒防抖自动写回文件（防回环：自己写出的内容不触发重解析；不支持该 API 的浏览器降级为只读载入）。新增「📊 习惯」页：选择 usage.jsonl 全本地渲染 KPI、技能/MCP 调用排行、插件分布、近 14 天活跃趋势、活跃时段与习惯候选卡片（含证据与固化建议），可一键复制 Markdown 总结供 /codex-habit 使用。流程类命令（/codex-flow、/codex-flow-save、/codex-summary）产出流程图后会**询问并打开**可视化编辑器。

- **0.7.0**：编辑器工作台化（参考 [dsh-deepseek-flow](https://github.com/kanghelyu/dsh-deepseek-flow) 能力全集）——新增多工作流（本地持久化、下拉切换、总控视图汇总节点/门/子流程引用关系）、「总控流程 + 分布工作区」（节点可标记为子流程 ▸→另一工作流，双击虚线节点跳转）；Markdown / JSON / Mermaid 三页签与画布双向同步，JSON 与 Markdown 均可导入导出（门与子流程完整保留，mermaid 以 `⚙门` `▸→流程` 标签后缀携带）；八类逻辑门（IF/ELSE、AND、OR、NOT、NAND、NOR、XOR、XNOR，带规则校验：NOT 类单输入、IF 最多两分支并建议「是/否」标注）；AI 助手（一键校验环路/门规则/可达性、生成优化提示词、粘贴 AI 回复解析为提案可接受可拒绝）；点阵网格背景随缩放平移；修复工作流存档读写键名不一致导致持久化失效的问题。

- **0.6.0**：编辑器体验升级（参考 [dsh-deepseek-flow](https://github.com/kanghelyu/dsh-deepseek-flow) 客户端实现与[能力页](https://deepseekflow.kanghelyu.org/#capabilities)）——新增撤销/重做（Ctrl+Z/Y，60 步快照栈）、Backspace 删除与 Esc 取消选中；滚轮语义对齐主流画布（滚轮平移、Ctrl+滚轮缩放）并新增画布悬浮缩放按钮；连线校验（拒绝重复连线与自环，toast 提示）；反向边绕行路由（不穿过中间节点）；超过 8 层的线性链自动蛇形折行；新增明暗主题切换（记忆偏好）。
- **0.5.0**：可视化编辑流程图（参考 [dsh-deepseek-flow](https://github.com/kanghelyu/dsh-deepseek-flow) 的"文本是唯一事实源 + 画布双向同步"思路）——新增 `assets/flow-editor.html` 零依赖单文件画布编辑器（拖拽节点、端口连线、改标签/形状/分组、自动重排、平移缩放，mermaid 源码双向同步，离线可用）与新命令 `/codex-flow-edit`（注入流程图 → 浏览器打开 → 导出 .mmd → 可用 `/codex-flow-save` 回写框架）；命令总数增至 9 个。

- **0.4.1**：试用反馈修复——`/codex-flow-save` 存入框架时 `versions` 的 `summary` 误写为项目名，现改为接收一句话摘要参数（缺省给出占位说明），并补充参数校验；`/codex-flow` 历史会话解析改为只取与最后一行同 querySource 的 full 行拼接（避免混合来源会话拼错开头）；`/codex-usage` 命令补充脚本输出 `EMPTY`（统计范围内无记录）的处理说明。

- **0.4.0**：流程审查与改进闭环——新增 6 个命令：`/codex-review`（自我提问审查，可省/可优化/保留推荐）、`/codex-optimize`（项目结束总结 + 优化提示词推荐）、`/codex-habit`（个人习惯自动写成 skill，自主编写）、`/codex-flow-save`（流程框架持续搭建，人可编辑 flow.json，支持 kroki/mermaid-cli/AI 生图渲染）、`/codex-agents-review`（三子智能体并行审查 + 跨智能体总结沉淀）、`/codex-summary`（最后汇总总流程图与闭环报告）。
- **0.3.0**：随仓库按里程碑发布 Release 安装包（`codex-manager-v0.3.0.zip`）；本 README 改为中英双语并加入 zip 安装包使用方法；插件清单版本与市场清单同步至 0.3.0。同仓库新增 OpenAI Codex CLI 适配（`codex-cli-adapter/`，见仓库根 README）。
- **0.2.0**：用量报表的"最近使用"与"最近 N 天"过滤改用本地时区（此前为 UTC，过滤会漏掉下午的记录）；明细表只统计技能/MCP 调用，会话记录只计入概览页；流程图脚本把 meta 概要事件移到事件流开头。
- **0.1.0**：首个版本。用量记录钩子、`/codex-usage` 报表、`/codex-flow` 流程图。
