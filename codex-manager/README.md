# Codex Manager（Codex 管家）

ZCode 插件 · ZCode plugin · v0.5.0

[English](#english) | [简体中文](#中文)

一个用于管理 Codex 工作台的 ZCode 插件：自动看见其他插件的使用量、一键调出 Excel 用量表格、把每次工作会话转化为 Mermaid 流程图并在浏览器画布上可视化编辑。画图不是目的——流程图让审查与修改变得可见：对照图发现绕路与重复，改进下一次工作。当前版本 **v0.5.0**，由 [@sanhansan](https://github.com/sanhansan) 维护。

---

## 中文

### zip 安装包使用方法

1. 打开 [Releases](https://github.com/sanhansan/codex-manager/releases) 页面，下载最新版的 `codex-manager-vX.Y.Z.zip`（当前 **v0.5.0**）；
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
| 可视化编辑流程图 | 命令 `/codex-flow-edit` `[文件或项目名]` | 在浏览器画布上拖拽节点、连线、改标签，与 mermaid 源码双向同步；导出 `.mmd` 后可用 `/codex-flow-save` 回写项目框架 |
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

A ZCode plugin for managing your Codex workbench: see other plugins' usage automatically, bring up an Excel usage report with one command, and turn every work session into a Mermaid flowchart you can visually edit on a canvas. The diagram is not the goal — it makes review possible: spot detours and repeats against it, then improve the next run. Current version **v0.5.0**, maintained by [@sanhansan](https://github.com/sanhansan).

### How to use the zip package

1. Open the [Releases](https://github.com/sanhansan/codex-manager/releases) page and download the latest `codex-manager-vX.Y.Z.zip` (currently **v0.5.0**);
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
| Visual flowchart editor | `/codex-flow-edit` `[file or project]` | Drag nodes, connect, relabel on a browser canvas with two-way mermaid sync; export `.mmd` and write it back to the project framework via `/codex-flow-save` |
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

- **0.5.0**：可视化编辑流程图（参考 [dsh-deepseek-flow](https://github.com/kanghelyu/dsh-deepseek-flow) 的"文本是唯一事实源 + 画布双向同步"思路）——新增 `assets/flow-editor.html` 零依赖单文件画布编辑器（拖拽节点、端口连线、改标签/形状/分组、自动重排、平移缩放，mermaid 源码双向同步，离线可用）与新命令 `/codex-flow-edit`（注入流程图 → 浏览器打开 → 导出 .mmd → 可用 `/codex-flow-save` 回写框架）；命令总数增至 9 个。

- **0.4.1**：试用反馈修复——`/codex-flow-save` 存入框架时 `versions` 的 `summary` 误写为项目名，现改为接收一句话摘要参数（缺省给出占位说明），并补充参数校验；`/codex-flow` 历史会话解析改为只取与最后一行同 querySource 的 full 行拼接（避免混合来源会话拼错开头）；`/codex-usage` 命令补充脚本输出 `EMPTY`（统计范围内无记录）的处理说明。

- **0.4.0**：流程审查与改进闭环——新增 6 个命令：`/codex-review`（自我提问审查，可省/可优化/保留推荐）、`/codex-optimize`（项目结束总结 + 优化提示词推荐）、`/codex-habit`（个人习惯自动写成 skill，自主编写）、`/codex-flow-save`（流程框架持续搭建，人可编辑 flow.json，支持 kroki/mermaid-cli/AI 生图渲染）、`/codex-agents-review`（三子智能体并行审查 + 跨智能体总结沉淀）、`/codex-summary`（最后汇总总流程图与闭环报告）。
- **0.3.0**：随仓库按里程碑发布 Release 安装包（`codex-manager-v0.3.0.zip`）；本 README 改为中英双语并加入 zip 安装包使用方法；插件清单版本与市场清单同步至 0.3.0。同仓库新增 OpenAI Codex CLI 适配（`codex-cli-adapter/`，见仓库根 README）。
- **0.2.0**：用量报表的"最近使用"与"最近 N 天"过滤改用本地时区（此前为 UTC，过滤会漏掉下午的记录）；明细表只统计技能/MCP 调用，会话记录只计入概览页；流程图脚本把 meta 概要事件移到事件流开头。
- **0.1.0**：首个版本。用量记录钩子、`/codex-usage` 报表、`/codex-flow` 流程图。
