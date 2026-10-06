# Codex Manager（Codex 管家）

ZCode 插件 · ZCode plugin · v0.3.0

[English](#english) | [简体中文](#中文)

一个用于管理 Codex 工作台的 ZCode 插件：自动看见其他插件的使用量、一键调出 Excel 用量表格、把每次工作会话转化为 Mermaid 流程图。画图不是目的——流程图让审查与修改变得可见：对照图发现绕路与重复，改进下一次工作。当前版本 **v0.3.0**，由 [@sanhansan](https://github.com/sanhansan) 维护。

---

## 中文

### zip 安装包使用方法

1. 打开 [Releases](https://github.com/sanhansan/codex-manager/releases) 页面，下载最新版的 `codex-manager-vX.Y.Z.zip`（当前 **v0.3.0**）；
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

也支持自然语言触发："看看插件使用量""把这次工作画成流程图"。

### 组成

- `hooks/hooks.json` + `hooks/log-usage.mjs`：PostToolUse（Skill / mcp__*）与 SessionStart 钩子，静默写用量日志，绝不阻塞会话。
- `commands/codex-usage.md`：用量报表命令。
- `commands/codex-flow.md`：流程图命令。
- `skills/codex-manager/SKILL.md`：自然语言触发入口。

### 数据与隐私

用量日志只包含：时间戳、类型、插件名、技能/工具名、会话 ID、工作目录。全部保存在本机 `~/.zcode/codex-manager/`，不联网上传，可随时删除。

---

## English

A ZCode plugin for managing your Codex workbench: see other plugins' usage automatically, bring up an Excel usage report with one command, and turn every work session into a Mermaid flowchart. The diagram is not the goal — it makes review possible: spot detours and repeats against it, then improve the next run. Current version **v0.3.0**, maintained by [@sanhansan](https://github.com/sanhansan).

### How to use the zip package

1. Open the [Releases](https://github.com/sanhansan/codex-manager/releases) page and download the latest `codex-manager-vX.Y.Z.zip` (currently **v0.3.0**);
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

Natural language works too: "show plugin usage", "chart this session".

### Components

- `hooks/hooks.json` + `hooks/log-usage.mjs`: PostToolUse (Skill / mcp__*) and SessionStart hooks that silently append to the usage log — never blocking your session.
- `commands/codex-usage.md`: usage report command.
- `commands/codex-flow.md`: flowchart command.
- `skills/codex-manager/SKILL.md`: natural-language trigger entry.

### Data & privacy

The usage log holds six metadata fields only (timestamp, type, plugin name, skill/tool name, session ID, working directory), stored locally at `~/.zcode/codex-manager/`, never uploaded; delete the file to wipe history.

---

## 版本历史 / Changelog

- **0.3.0**：随仓库按里程碑发布 Release 安装包（`codex-manager-v0.3.0.zip`）；本 README 改为中英双语并加入 zip 安装包使用方法；插件清单版本与市场清单同步至 0.3.0。同仓库新增 OpenAI Codex CLI 适配（`codex-cli-adapter/`，见仓库根 README）。
- **0.2.0**：用量报表的"最近使用"与"最近 N 天"过滤改用本地时区（此前为 UTC，过滤会漏掉下午的记录）；明细表只统计技能/MCP 调用，会话记录只计入概览页；流程图脚本把 meta 概要事件移到事件流开头。
- **0.1.0**：首个版本。用量记录钩子、`/codex-usage` 报表、`/codex-flow` 流程图。
