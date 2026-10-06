# 更新日志 / Changelog

本项目由 [@sanhansan](https://github.com/sanhansan) 维护。格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循语义化版本。

## [0.4.1] - 2026-10-06

### 修复：试用反馈（真实数据全流程实测后）

- **`/codex-flow-save`**：存入项目框架时 `versions` 记录的 `summary` 字段误写为项目名，导致版本历史每条摘要相同——现改为接收一句话摘要参数（来自会话梳理，缺省给出占位说明），并补充参数校验（缺参数输出用法并以非 0 退出）
- **`/codex-flow`**：历史会话解析改为只取与最后一行**同 querySource** 的 full 行拼接会话开头（此前注释声称如此但代码未过滤，混合来源会话可能拼错）；已在 41MB 真实大会话上复验，输出与修复前一致
- **`/codex-usage`**：命令文档补充脚本输出 `EMPTY`（统计范围内无记录）的处理说明，避免生成空表
- README「组成」一节补全 8 个命令清单；插件清单与市场清单版本号同步至 0.4.1

## [0.4.0] - 2026-10-06

### 新增：流程审查与改进闭环（6 个新命令）

- **`/codex-review` 自我流程提问审查**：7 类审查问题逐条自问自答，生成类型化推荐（可省 / 可优化 / 保留 / 习惯），每条附事件依据与量化收益
- **`/codex-optimize` 项目结束总结**：复盘报告 + 优化提示词推荐——吸收本项目踩坑教训、可直接复制使用的提示词模板（`$变量` 占位）
- **`/codex-habit` 个人习惯成 skill**：从用量日志、审查记录、提示词推荐中提炼习惯（证据排序），**自主编写** SKILL.md 草稿，确认后装进插件
- **`/codex-flow-save` 流程框架持续搭建**：把会话流程合并进项目级 `flow.json`（人可编辑 JSON，支持不断修改与扩展），并支持调用生图渲染流程图（kroki.io / mermaid-cli / AI 生图工具，按序降级）
- **`/codex-agents-review` 多子智能体审查**：效率 / 质量 / 提示词三个子智能体并行审查，总智能体去重、裁决（质量关口优先）、汇总；结论沉淀进 `agent_summaries`，跨会话、跨智能体累积，避免重复发现
- **`/codex-summary` 最后汇总**：把持续搭建的框架汇成总流程图与审查闭环报告（发现 → 采纳对照、习惯与技能、提示词资产、下一步建议）
- 技能路由同步扩展；同一项目下支持持续性总结搭建，最后汇总

## [0.3.0] - 2026-10-06

### 新增
- **OpenAI Codex CLI 适配**（`codex-cli-adapter/`，已在 codex-cli 0.157.1 真实环境验证）：
  - `codex_manager.py`：扫描 `~/.codex/sessions` 会话记录，聚合 MCP/内置工具用量、令牌消耗，导出 Excel/CSV，提取事件流生成 Mermaid 流程图
  - `mcp_server.py`：纯标准库 MCP 服务器，向 Codex 暴露 `codex_usage` / `codex_flow` / `codex_sessions` 三个工具
  - `/codex-usage`、`/codex-flow` 自定义命令（安装到 `~/.codex/prompts/`）
  - Windows（PowerShell）与 macOS/Linux 一键安装/卸载脚本，改写 `config.toml` 前自动备份、幂等可重复执行
- 仓库新增 `CHANGELOG.md` 与「安装包下载与使用」章节，开始按里程碑发布 Release 安装包

### 变更
- ZCode 插件清单与市场清单版本号同步至 0.3.0

## [0.2.0] - 2026-10-06

### 变更
- README 全面重构：标题 + 徽章、一段式简介、「核心架构与功能」三模块、部署与使用指南、注意事项、版权与组件声明
- 新增中英双语切换（`README.md` 简体中文 / `README.en.md` English）

## [0.1.0] - 2026-10-06

### 新增
- ZCode 插件 `codex-manager` 首个版本：
  - 钩子自动采集：技能调用（Skill）、MCP 工具调用、会话开始三类事件写入本机 `usage.jsonl`
  - `/codex-usage`：用量明细表 + 带样式 Excel 导出（无 openpyxl 时自动降级 CSV）
  - `/codex-flow`：当前/历史会话转 Mermaid 流程图，含"开头 + 最近窗口"拼接与缺口诚实标注
  - 自然语言触发技能入口
