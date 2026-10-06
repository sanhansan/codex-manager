# ZCode 插件仓库

个人 ZCode 插件集合，当前包含：

| 插件 | 说明 |
| --- | --- |
| [codex-manager](./codex-manager) | Codex 管家：自动统计各插件/技能/MCP 的使用量，一键导出 Excel 报表，把每次工作会话转化为 Mermaid 流程图 |

## 安装方式

### 方式一：本地目录（本机）

ZCode → 插件市场 → 添加 → 添加插件市场 → 选择本仓库克隆/下载后的目录（含 `marketplace.json` 的那层），然后在"个人"里安装插件。

### 方式二：GitHub 仓库源

ZCode → 插件市场 → 添加 → 添加插件市场 → 填入 `GitHub用户名/仓库名`（前提：ZCode 版本支持 github 类型市场源），然后在"个人"里安装。

## 目录结构

```text
marketplace.json          插件市场清单（ZCode 识别的入口）
codex-manager/            插件源码
  .zcode-plugin/plugin.json
  hooks/                  用量记录钩子（Skill / MCP / SessionStart）
  commands/               /codex-usage 与 /codex-flow 命令
  skills/                 自然语言触发入口
```

用量数据保存在本机 `~/.zcode/codex-manager/usage.jsonl`，不上传、不入库。
