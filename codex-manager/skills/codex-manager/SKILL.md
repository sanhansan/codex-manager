---
name: codex-manager
description: Use when the user asks about plugin/skill/MCP usage statistics (插件使用量、使用统计、使用报表、哪个插件用得多、MCP 调用次数), wants to export a usage spreadsheet (导出表格、Excel 报表), or wants a work session turned into a flowchart (工作流程图、会话复盘、把这次工作画成流程图). Backed by automatic usage-logging hooks and the /codex-usage and /codex-flow commands.
---

# Codex Manager：用量统计与工作流程图

数据来源：本插件的钩子把每次技能（Skill 工具）调用、MCP 工具调用和会话开始自动追加到
`%USERPROFILE%\.zcode\codex-manager\usage.jsonl`，每行一个 JSON：`ts / kind(skill|mcp|session) / plugin / name / session / cwd`。

处理请求：

- 用户要"使用量 / 统计 / 报表 / 表格" → 按插件命令 `/codex-usage` 的步骤执行（读日志 → 运行其内嵌 Python 脚本聚合 → 回复 Markdown 表格并生成 xlsx）。
- 用户要"流程图 / 复盘" → 按插件命令 `/codex-flow` 的步骤执行（当前会话直接梳理；历史会话用其内嵌 Python 脚本从 `%USERPROFILE%\.zcode\cli\rollout\model-io-sess_*.jsonl` 提取事件流）。

规则：

- 只报告真实记录的数据，不编造。日志为空或不存在时如实说明，并提示数据会随使用自动积累。
- 生成的报表/流程图文件保存到当前工作区根目录，并在回复中给出完整路径。
- 用户没装 openpyxl 时降级为 CSV，不要安装依赖。
