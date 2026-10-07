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
- **插件使用量**：读取 `~/.codex/config.toml` 的 `[plugins."名称@市场"]` 清单（`enabled = false` 跳过），并扫描插件缓存 `~/.codex/plugins/cache/*/*/*/.mcp.json`（含 `plugin.json` 内指针）建立 **MCP 服务器 → 插件归属**；报表中每个插件列出提供的 MCP 服务器、调用次数、会话数与最近调用（已安装未使用的也列出）。
- **任务消耗**：按 `task_started → task_complete` 划分任务并绑定该任务的用户指令；令牌取 `token_usage_record.turn_token_usage`（任务内累计，按 turn_id 差分，回放/续接任务与累计值重置均有保护），报表给出「任务消耗 Top 10」与逐任务明细。
- **令牌（会话级）**：取 `token_usage_record.thread_token_usage`（线程累计，会话级为最后一条）；旧格式回退 `event_msg:token_count`。经历过上下文压缩（compaction）的会话会标注。
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
| `codex_manager.py` | 核心：会话解析、用量聚合（插件归属 / 任务消耗）、Excel/CSV 导出、流程提取（无第三方依赖，openpyxl 按需） |
| `mcp_server.py` | MCP 服务器（stdio JSON-RPC），暴露 3 个工具给 Codex |
| `prompts/codex-usage.md` | 自定义命令 `/codex-usage` |
| `prompts/codex-flow.md` | 自定义命令 `/codex-flow` |
| `install.ps1` / `install.sh` | 一键安装/卸载 |
