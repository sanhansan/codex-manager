#!/usr/bin/env bash
# Codex Manager — Codex CLI 适配版安装/卸载脚本（macOS / Linux）
# 用法：./install.sh 安装；./install.sh --uninstall 卸载
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_DIR="$HOME/.codex"
PROMPTS_DIR="$CODEX_DIR/prompts"
CONFIG="$CODEX_DIR/config.toml"
MARKER="mcp_servers.codex-manager"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$PROMPTS_DIR/codex-usage.md" "$PROMPTS_DIR/codex-flow.md" && echo "prompts removed"
  if [[ -f "$CONFIG" ]] && grep -q "$MARKER" "$CONFIG"; then
    cp "$CONFIG" "$CONFIG.bak-uninstall"
    python3 - "$CONFIG" <<'PY'
import re, sys
p = sys.argv[1]
t = open(p, encoding="utf-8").read()
t = re.sub(r"# >>> codex-manager begin >>>.*?# <<< codex-manager end <<<\n?", "", t, flags=re.S)
open(p, "w", encoding="utf-8").write(t)
print("config.toml: codex-manager block removed")
PY
  fi
  echo "Done. Restart Codex to take effect."
  exit 0
fi

if [[ ! -d "$CODEX_DIR" ]]; then
  echo "错误：未找到 $CODEX_DIR —— 请先安装并运行过 OpenAI Codex CLI。" >&2
  exit 1
fi

mkdir -p "$PROMPTS_DIR"
cp "$ADAPTER_DIR/prompts/codex-usage.md" "$ADAPTER_DIR/prompts/codex-flow.md" "$PROMPTS_DIR/"
echo "prompts installed: ~/.codex/prompts/{codex-usage,codex-flow}.md"

if [[ -f "$CONFIG" ]]; then
  if grep -q "$MARKER" "$CONFIG"; then
    echo "config.toml: codex-manager MCP 已注册，跳过"
  else
    cp "$CONFIG" "$CONFIG.bak-codexmanager"
    SCRIPT="$ADAPTER_DIR/mcp_server.py"
    cat >> "$CONFIG" <<EOF

# >>> codex-manager begin >>>
[mcp_servers.codex-manager]
command = "python3"
args = ["$SCRIPT"]
# <<< codex-manager end <<<
EOF
    echo "config.toml: added [mcp_servers.codex-manager] (backup: config.toml.bak-codexmanager)"
  fi
else
  echo "警告：未找到 config.toml，已跳过 MCP 注册（提示词已装，可直接用 CLI 脚本）"
fi

echo ""
echo "完成。请重启 Codex 使 MCP 注册生效，然后在会话里输入 /codex-usage 或 /codex-flow 试试。"
