# Codex Manager

Codex 工作台的插件用量管理与工作流程图工具。

[English](README.md) | 简体中文

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-ZCode%20Plugin-green.svg)
![Runtime](https://img.shields.io/badge/runtime-Node.js%20%7C%20Python%203.x-yellow.svg)

本插件面向 Codex 式 AI 编程智能体工作台（基于 ZCode 插件生态构建），旨在回答两个高频问题："我装的这些插件，到底哪个用得多？"以及"这次任务，AI 到底是怎么一步步干完的？"。通过后台钩子自动采集、命令一键出结果的无感设计，降低使用门槛，让插件用量与工作过程一目了然。

**为什么重要：流程图不是一张图，而是审查工具。** 当每次工作都变成一张图，绕路、重复、多余步骤一目了然——先审查，再修改，下一次执行就更快更准。Codex Manager 把"看清流程 → 审查流程 → 修改流程"变成日常习惯，用量统计则验证每次修改是否真的有效。

> **维护状态**：本项目由 [@sanhansan](https://github.com/sanhansan) 持续维护，最近更新 2026-10-06；问题反馈与新适配建议请提 [Issue](https://github.com/sanhansan/codex-manager/issues)。

## 安装包下载与使用

全部版本发布在 [Releases](https://github.com/sanhansan/codex-manager/releases) 页面，按里程碑依次发布、持续维护：

| 版本 | 发布日期 | 包内容 | 适合谁 |
| --- | --- | --- | --- |
| **v0.3.0（最新，推荐）** | 2026-10-06 | 完整版：ZCode 插件（0.3.0）+ OpenAI Codex CLI 适配 + 中英双语文档 | 想一次拿全所有功能 |
| v0.2.0 | 2026-10-06 | ZCode 插件 + 结构化中英双语文档 | 只使用 ZCode |
| v0.1.0 | 2026-10-06 | ZCode 插件初版 | 只需基础用量统计 |

**下载 zip 后的使用方法**：

1. **ZCode 插件**（三个版本均包含）：解压 → ZCode → 插件市场 → 添加 → 添加插件市场 → 选择解压出的 `codex-manager` 目录（含 `marketplace.json` 的那一层）→ 在"个人"页安装 Codex Manager。
2. **OpenAI Codex CLI 适配**（v0.3.0 起包含）：解压后进入 `codex-cli-adapter/`，Windows 执行 `powershell -ExecutionPolicy Bypass -File install.ps1`，macOS/Linux 执行 `./install.sh`，然后**重启 Codex**，在会话里输入 `/codex-usage` 或 `/codex-flow`。
3. **独立命令行**（v0.3.0 起包含，无需任何宿主）：`python codex-cli-adapter/codex_manager.py usage --days 30 --xlsx report.xlsx` 直接统计本机 Codex 用量。

各版本的具体变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 核心架构与功能

插件功能分为四个逻辑模块：用量自动采集、报表一键生成、工作流程复盘，以及面向 OpenAI Codex CLI 的独立适配。

### 一、 用量自动采集（零操作）

针对"装了一堆插件但从不知道用了多少"的痛点，提供全自动的后台记录。

- __技能调用记录__：通过 `PostToolUse` 钩子捕获每次插件技能（Skill）调用，按"插件名 + 技能名"归档计数。
- __MCP 工具记录__：捕获所有 `mcp__` 前缀的 MCP 工具调用，按 MCP 服务器归档，与插件用量统一呈现。
- __会话计数__：通过 `SessionStart` 钩子记录每次会话开始，量化你的日常工作强度。
- __静默可靠__：钩子脚本任何异常均静默退出，绝不阻塞或打断正常会话。

### 二、 报表一键生成（/codex-usage）

对采集到的用量数据提供独立的汇总、展示与导出。

- __对话内明细表__：以 Markdown 表格输出按调用次数降序的"插件/来源、技能/工具、类型、调用次数、涉及会话数、最近使用"明细。
- __Excel 导出__：生成双 Sheet 带样式报表（使用明细 + 概览），支持冻结表头与自动筛选，文件名形如 `codex-usage-<时间>.xlsx`。
- __时间窗口__：支持参数指定"统计最近 N 天"，默认统计全部记录。
- __降级策略__：检测不到 openpyxl 时自动降级为 CSV（UTF-8 BOM，Excel 可直接打开），不安装任何依赖。

### 三、 工作流程复盘（/codex-flow）

将一次工作会话转化为可分享的 Mermaid 流程图。

- __当前会话__：直接梳理当前对话——用户需求 → 各工作阶段 → 关键分支 → 最终产出——生成 `flowchart TD` 流程图并保存为 `.md` 文件。
- __历史会话__：解析工作台的会话记录文件（`model-io-sess_*.jsonl`），按序提取用户指令与工具调用事件；支持 `recent`（最近会话）或会话 ID 片段定位。
- __智能拼接__：大会话采用"开头前缀 + 最近窗口"拼接策略，最大限度还原完整过程。
- __诚实标注__：记录中段缺失时以 gap 事件如实标注"中段省略"，绝不编造流程节点。

### 四、 OpenAI Codex CLI 适配（codex-cli-adapter/）

面向 OpenAI Codex CLI（已在 codex-cli 0.157.1 真实环境验证）的第二适配目标。Codex CLI 没有钩子系统，改用三条通道实现同等能力：扫描 `~/.codex/sessions` 会话记录离线统计用量；注册一个纯标准库实现的 MCP 服务器（`codex_usage` / `codex_flow` / `codex_sessions` 三个工具）；安装 `/codex-usage`、`/codex-flow` 自定义命令。统计口径覆盖 MCP 服务器调用、exec 等原生工具、collaboration 内置命名空间与令牌消耗（含压缩会话的诚实标注）。

```bash
powershell -ExecutionPolicy Bypass -File codex-cli-adapter/install.ps1   # Windows
./codex-cli-adapter/install.sh                                           # macOS / Linux
```

详见 [codex-cli-adapter/README.md](./codex-cli-adapter/README.md)。

## 部署与使用指南

### 系统要求

- ZCode 桌面端（支持插件系统的版本），或任何兼容 ZCode 插件清单格式的工作台。
- Node.js（钩子脚本运行时，任意 LTS 版本）。
- Python 3.10+ 与 openpyxl（仅 Excel 导出需要，缺失时自动降级 CSV）。

### 获取仓库

```bash
git clone https://github.com/sanhansan/codex-manager.git
```

### 安装插件（二选一）

- __方式一（本地目录，通用）__：打开 ZCode → 插件市场 → 添加 → 添加插件市场 → 选择克隆后的 `codex-manager` 目录（含 `marketplace.json` 的那一层）→ 在"个人"页找到 Codex Manager → 安装。
- __方式二（GitHub 市场源）__：添加插件市场时直接填 `sanhansan/codex-manager`（需客户端支持 github 类型市场源），后续在"个人"页安装。

安装后建议新开一个任务，随便触发几个插件技能，再运行 `/codex-usage` 验证数据采集是否生效。

### 命令速查

| 命令 | 参数 | 作用 |
| --- | --- | --- |
| `/codex-usage` | `[N]`（可选，统计最近 N 天） | 输出用量明细表并导出 Excel |
| `/codex-flow` | 不填 / `recent` / 会话 ID 片段 | 当前会话 / 最近会话 / 指定会话生成流程图 |

## 注意事项

### 关于数据与隐私

- __采集范围__：仅时间戳、类型、插件名、技能/工具名、会话 ID、工作目录六项元数据，不含对话内容。
- __存储位置__：本机 `~/.zcode/codex-manager/usage.jsonl`，每行一个 JSON 对象，不联网上传。
- __随时清除__：直接删除该文件即可清空历史，钩子会自动重建。

### 关于首次使用

- 刚安装后日志为空属正常现象，报表依赖真实使用积累。
- 用量统计只包含安装本插件之后的数据，无法回溯历史。

### 关于历史会话解析

- 工作台对长会话采用滑动窗口存储，脚本以"最后一次全量行 + 最后一行"拼接，若两次覆盖范围之间存在缺口，会在事件流中输出 gap 标注——绘图时应体现"中段省略"，这是有意设计而非缺陷。
- 会话文件位于 `~/.zcode/cli/rollout/`，体积可能达数十 MB，解析脚本已按纯文本扫描优化。

### 关于插件更新

1. 拉取最新代码：在仓库目录执行 `git pull`。
2. 校对版本：确认插件清单（`.zcode-plugin/plugin.json`）中的版本号是否高于已安装版本。
3. 应用更新：ZCode → 市场源 → 刷新该市场 → 个人 → 插件详情 → 更新。源码修改不会热加载，必须走市场刷新 + 更新动作。

## 版权与组件声明

本项目自身代码遵循 MIT License 协议发布。Excel 导出功能依赖开源组件 openpyxl（MIT License），流程图采用 Mermaid 语法（可在 GitHub / VS Code / mermaid.live 直接渲染）；插件清单与钩子机制基于 ZCode 插件框架规范实现。
