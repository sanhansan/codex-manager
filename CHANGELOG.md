# 更新日志 / Changelog

本项目由 [@sanhansan](https://github.com/sanhansan) 维护。格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循语义化版本。

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
