---
description: 统计 Codex 的插件/工具用量并导出报表
---

用户想查看 Codex 的使用量统计。参数：$ARGUMENTS（如果为空则统计全部记录）。

按以下步骤执行：

1. 优先调用 MCP 工具 `codex_usage`（参数 days = $ARGUMENTS，无参数则不传）。把返回的 Markdown 表格完整呈现给用户，并对「哪个插件/MCP 服务器/工具用得最多、任务消耗 Top 任务与令牌结构」给一两句解读。
2. 如果 `codex_usage` 工具不可用（未注册 MCP），改为在 shell 里运行：
   `python "<本提示词所在插件目录>/codex-cli-adapter/codex_manager.py" usage --days $ARGUMENTS`
   （days 为空时去掉 --days 参数）。把输出的 Markdown 表格完整呈现。
3. 如果用户明确要 Excel 文件：在上述命令后追加 `--xlsx codex-usage-<YYYYMMDD-HHMMSS>.xlsx`（保存到当前工作目录），完成后告知完整路径；若报 openpyxl 缺失，改用 `--csv`（UTF-8 BOM，Excel 可直接打开），并提示可 `pip install openpyxl` 后重试。
4. 如实呈现：报表只包含本机 `~/.codex/sessions` 里已有会话的记录；记录为空时直接说明，不要编造数据。
