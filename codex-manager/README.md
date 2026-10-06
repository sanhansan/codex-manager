# Codex Manager（Codex 管家）

一个 ZCode 插件，帮你管理 Codex 工作台的插件使用情况并复盘每次工作。

## 功能

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| 看见其他插件的使用量 | 自动 | 钩子把每次技能调用、MCP 调用、会话开始追加到 `%USERPROFILE%\.zcode\codex-manager\usage.jsonl` |
| 一键调出表格 | 命令 `/codex-usage` | 聚合用量并生成带样式的 Excel（`codex-usage-<时间>.xlsx`），同时在对话中给出 Markdown 表格；可选参数：统计最近 N 天 |
| 工作转化为流程图 | 命令 `/codex-flow` | 当前会话直接梳理成 Mermaid 流程图；参数 `recent` 或会话 ID 可复盘历史会话（读取 `%USERPROFILE%\.zcode\cli\rollout\model-io-sess_*.jsonl`），产物为 `codex-flow-<时间>.md` |

## 组成

- `hooks/hooks.json` + `hooks/log-usage.mjs`：PostToolUse（Skill / mcp__*）与 SessionStart 钩子，静默写用量日志，绝不阻塞会话。
- `commands/codex-usage.md`：用量报表命令。
- `commands/codex-flow.md`：流程图命令。
- `skills/codex-manager/SKILL.md`：自然语言触发（如"看看插件使用量""把这次工作画成流程图"）。

## 数据与隐私

用量日志只包含：时间戳、类型、插件名、技能/工具名、会话 ID、工作目录。全部保存在本机 `~/.zcode/codex-manager/`，可随时删除。

## 版本历史

- **0.2.0**：用量报表的"最近使用"与"最近 N 天"过滤改用本地时区（此前为 UTC，过滤会漏掉下午的记录）；明细表只统计技能/MCP 调用，会话记录只计入概览页；流程图脚本把 meta 概要事件移到事件流开头。
- **0.1.0**：首个版本。用量记录钩子、`/codex-usage` 报表、`/codex-flow` 流程图。
