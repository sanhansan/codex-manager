# Codex Manager — Codex CLI 适配版安装/卸载脚本（Windows PowerShell）
# 用法：
#   powershell -ExecutionPolicy Bypass -File install.ps1            # 安装
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall # 卸载
param([switch]$Uninstall)

$ErrorActionPreference = "Stop"
$AdapterDir = $PSScriptRoot
$CodexDir = Join-Path $env:USERPROFILE ".codex"
$PromptsDir = Join-Path $CodexDir "prompts"
$ConfigPath = Join-Path $CodexDir "config.toml"
$Marker = "mcp_servers.codex-manager"

if ($Uninstall) {
    foreach ($f in @("codex-usage.md", "codex-flow.md")) {
        $p = Join-Path $PromptsDir $f
        if (Test-Path $p) { Remove-Item $p -Force; Write-Host "removed $p" }
    }
    if (Test-Path $ConfigPath) {
        $text = Get-Content $ConfigPath -Raw
        $pattern = '(?ms)# >>> codex-manager begin >>>.*?# <<< codex-manager end <<<\r?\n?'
        if ($text -match $pattern) {
            $text = $text -replace $pattern, ""
            Copy-Item $ConfigPath "$ConfigPath.bak-uninstall" -Force
            Set-Content $ConfigPath $text -Encoding UTF8
            Write-Host "removed mcp_servers.codex-manager from config.toml (backup: config.toml.bak-uninstall)"
        } else { Write-Host "config.toml: no codex-manager block found" }
    }
    Write-Host "Done. Restart Codex to take effect."
    exit 0
}

if (-not (Test-Path $CodexDir)) {
    Write-Error "未找到 $CodexDir —— 请先安装并运行过 OpenAI Codex CLI。"
}

# 1) 自定义提示词 → /codex-usage 与 /codex-flow
New-Item $PromptsDir -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $AdapterDir "prompts\codex-usage.md") $PromptsDir -Force
Copy-Item (Join-Path $AdapterDir "prompts\codex-flow.md") $PromptsDir -Force
Write-Host "prompts installed: ~/.codex/prompts/codex-usage.md, codex-flow.md"

# 2) 注册 MCP 服务器（幂等，带备份）
if (Test-Path $ConfigPath) {
    $text = Get-Content $ConfigPath -Raw
    if ($text -match [regex]::Escape($Marker)) {
        Write-Host "config.toml: codex-manager MCP 已注册，跳过"
    } else {
        Copy-Item $ConfigPath "$ConfigPath.bak-codexmanager" -Force
        $scriptPath = (Join-Path $AdapterDir "mcp_server.py") -replace "\\", "/"
        $block = @"

# >>> codex-manager begin >>>
[mcp_servers.codex-manager]
command = "python"
args = ["$scriptPath"]
# <<< codex-manager end <<<
"@
        Add-Content $ConfigPath $block -Encoding UTF8
        Write-Host "config.toml: added [mcp_servers.codex-manager] (backup: config.toml.bak-codexmanager)"
    }
} else {
    Write-Warning "未找到 config.toml，已跳过 MCP 注册（提示词已装，可直接用 CLI 脚本）"
}

Write-Host ""
Write-Host "完成。请重启 Codex 使 MCP 注册生效，然后在会话里输入 /codex-usage 或 /codex-flow 试试。"
