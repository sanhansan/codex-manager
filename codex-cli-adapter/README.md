# Codex CLI 适配版（codex-cli-adapter）

这是 Codex Manager 面向 **OpenAI Codex CLI** 的适配实现（已在 codex-cli **0.157.1** 真实环境验证）。由于 Codex CLI 没有钩子系统，本适配改用三条通道实现同等能力：

1. **会话记录解析** —— 扫描 `~/.codex/sessions` 的 `rollout-*.jsonl`（codex-cli 0.157.x 记录格式），离线统计用量、提取会话事件流；
2. **MCP 服务器** —— `mcp_server.py`（纯标准库实现，零第三方依赖）注册进 `~/.codex/config.toml` 后，把 `codex_usage` / `codex_flow` / `codex_sessions` 三个工具直接交给 Codex 调用；
3. **自定义提示词** —— `prompts/*.md` 安装到 `~/.codex/prompts/`，在 Codex 会话里输入 `/codex-usage`、`/codex-flow` 一键出结果。

## 安装 / 卸载

```powershell
# Windows（PowerShell）
powershell -ExecutionPolicy Bypass -File install.ps1             # 安装
powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall  # 卸载
```

```bash
# macOS / Linux
./install.sh             # 安装
./install.sh --uninstall # 卸载
```

安装器会：把两个提示词复制到 `~/.codex/prompts/`；在 `config.toml` 末尾追加 `[mcp_servers.codex-manager]` 注册 MCP 服务器（写入前自动备份为 `config.toml.bak-codexmanager`，幂等可重复执行）。装完**重启 Codex** 生效。

## 统计口径

- **用量来源**：会话记录中的 `function_call`（`namespace` 以 `mcp__` 开头记为对应 MCP 服务器）、`custom_tool_call`（exec 等原生工具）、`collaboration` 等内置命名空间。
- **已安装插件**：读取 `~/.codex/config.toml` 的 `[plugins."名称@市场"]` 清单。
- **令牌**：取 `token_usage_record` 的 `total_token_usage`；经历过上下文压缩（compaction）的会话为最后一次上下文窗口的累计值，报表会自动标注。
- **隐私**：全部本地解析，不联网上传。

## 直接用 CLI（不装提示词/MCP 也可以）

```bash
python codex_manager.py usage --days 30 --xlsx report.xlsx   # 用量报表 + Excel
python codex_manager.py flow --session recent --out flow.md  # 最近会话流程图
python codex_manager.py flow --session <ID片段> --json       # 输出 JSON 事件流
```

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `codex_manager.py` | 核心：会话解析、用量聚合、Excel/CSV 导出、流程提取（无第三方依赖，openpyxl 按需） |
| `mcp_server.py` | MCP 服务器（stdio JSON-RPC），暴露 3 个工具给 Codex |
| `prompts/codex-usage.md` | 自定义命令 `/codex-usage` |
| `prompts/codex-flow.md` | 自定义命令 `/codex-flow` |
| `install.ps1` / `install.sh` | 一键安装/卸载 |
