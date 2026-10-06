---
description: 在浏览器里可视化编辑流程图（拖拽节点、连线、改标签），导出后可回写项目框架
argument-hint: "[可选：.md/.mmd 文件路径，或项目名；不填 = 先按 /codex-flow 模式 A 梳理当前会话]"
---

用户要在**画布上可视化修改**流程图（参考 Markdown-first 编辑器的思路：mermaid 文本是唯一事实源，画布改动实时写回文本）。按以下步骤执行：

## 第一步：确定要编辑的 mermaid 源

- 参数是 `.md` 文件路径 → 读取文件，提取**第一个** ```` ```mermaid ```` 代码块；参数是 `.mmd`/`.txt` → 全文即源。
- 参数是项目名 → 读 `%USERPROFILE%\.zcode\codex-manager\projects\<项目名>\flow.json`，取 `versions` 最后一条的 `mermaid`，并告知用户这是第几个版本（共几条）。
- 无参数 → 按 `/codex-flow` 模式 A 的规则，先从当前会话梳理并生成 mermaid（节点 4~12 个，中文标签 ≤20 字）。
- 都拿不到（如文件不存在）→ 如实告知并停止。

## 第二步：找到编辑器模板并生成工作副本

1. 模板文件是插件自带的 `assets/flow-editor.html`（零依赖单文件，离线可用）。按序查找：
   - `${CLAUDE_PLUGIN_ROOT}/assets/flow-editor.html`；
   - `~/.zcode/cli/plugins/cache/*/codex-manager/*/assets/flow-editor.html`（取版本号最大的一个）。
   都找不到 → 如实告知，建议更新或重装 codex-manager 插件，停止。
2. 用 python 生成**工作副本**到当前工作区根目录 `flow-editor.html`（每次覆盖，固定文件名）：

```python
# 用法: python _mk_editor.py <模板.html> <mermaid源文件> "来源描述"
import json, sys
tpl = open(sys.argv[1], encoding="utf-8").read()
mermaid = open(sys.argv[2], encoding="utf-8").read()
payload = json.dumps({"mermaid": mermaid, "source": sys.argv[3], "exportName": "flow-export.mmd"}, ensure_ascii=False).replace("</", "<\\/")
open("flow-editor.html", "w", encoding="utf-8").write(tpl.replace("/*__FLOW_DATA__*/null", payload, 1))
print("OK")
```

   把第一步拿到的 mermaid 先存成临时 `.mmd` 文件再执行（命令用完删除临时脚本与 `.mmd`）；来源描述写清楚（如 `项目 X 第 3 版` / `当前会话` / 文件路径）。

## 第三步：在浏览器打开

- Windows（Git Bash）：`cmd //c start "" "<flow-editor.html 完整路径>"`；cmd 下用 `start "" "<路径>"`；macOS 用 `open "<路径>"`。
- 告诉用户编辑器用法：**拖节点移动**；**从节点下方蓝色圆点拖到另一节点 = 连线**；**双击空白 = 新建节点**；右侧面板改标签/形状/分组；底部源码与画布**双向同步**；`Ctrl+S` 导出 `.mmd`（支持另存对话框的浏览器直接保存，否则走下载）；"自动重排"可一键整理布局。

## 第四步：回写（用户导出后）

- 用户用 `Ctrl+S` 导出（默认 `flow-export.mmd`）后，如需把改好的图存回项目框架 → 按 `/codex-flow-save` 的流程，把导出文件作为 mermaid 源合并进 `flow.json`（生成新的 versions 记录，摘要写明"可视化编辑"）。
- 只是临时改图不需要回写时，到此结束。
- **诚实原则**：编辑器忽略不支持的语法（classDef、嵌套 subgraph 等），导出文本可能与原文有格式差异但语义一致；若用户图里有大量高级语法，提示以预览为准、谨慎修改。
