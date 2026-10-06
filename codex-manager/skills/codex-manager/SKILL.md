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
