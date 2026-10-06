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

- Windows（ZCode 终端实为 cmd）：`start "" "<flow-editor.html 完整路径>"`；macOS 用 `open "<路径>"`。
- **若用户反馈浏览器显示「拒绝访问」/ ERR_ACCESS_DENIED，或文件方式打不开**：改用本地 HTTP 服务兜底（127.0.0.1 不受文件 ACL 与内置浏览器 file:// 限制）：
  1. 后台启动服务：`python -m http.server 8377 --directory "<工作副本所在目录>"`（用后台方式运行，别阻塞会话；端口被占用就换 8378 等）；
  2. 打开 `start "" "http://127.0.0.1:8377/flow-editor.html"`，并把该网址给用户。
  注意：HTTP 方式下「🔗 连接文件」仍可用（Edge/Chrome）。
- 告诉用户编辑器用法（v0.9.0 布局）：**左侧任务栏**可手动切换三个视图——「🖼 画布」编辑当前图；「🛰 分布工作区」每张卡片是一个工作流（打开/重命名/删除/导出）；「🧭 总控流程」用关系图 + 关系表查看所有工作流的子流程引用（点节点进入对应工作区）。工作流列表在任务栏下方，点击即切换。画布内：**拖节点移动**；**从节点下方蓝色圆点拖到另一节点 = 连线**；**双击空白 = 新建节点**；右侧面板改标签/形状/分组/逻辑门；底部 Mermaid / Markdown / JSON 三页签与画布**双向同步**；`Ctrl+S` 导出 `.mmd`；"自动重排"一键整理布局。
- **引导双向同步（code ↔ 网页，强烈推荐）**：打开后让用户点底部「🔗 连接文件」，选择刚才那个 mermaid/Markdown 文件。之后：你在会话里**改文件** → 页面 1~2 秒内自动重画；用户在**画布上改** → 自动写回文件，你读文件即可拿到最新版。要求 Edge/Chrome（File System Access API）；不支持的浏览器会降级为只读载入并提示。
- **习惯与技能可视化**：左侧任务栏「📊 习惯与技能」可选择 `usage.jsonl`（`%USERPROFILE%\.zcode\codex-manager\usage.jsonl`），本地渲染**技能总结**（每个技能/MCP 的调用次数、占比、最近使用时间与汇总结论）、调用排行、活跃趋势与习惯候选，可复制 Markdown 总结直接供本会话引用。

## 第四步：回写（用户导出后）

- 用户用 `Ctrl+S` 导出（默认 `flow-export.mmd`）后，如需把改好的图存回项目框架 → 按 `/codex-flow-save` 的流程，把导出文件作为 mermaid 源合并进 `flow.json`（生成新的 versions 记录，摘要写明"可视化编辑"）。
- 只是临时改图不需要回写时，到此结束。
- **诚实原则**：编辑器忽略不支持的语法（classDef、嵌套 subgraph 等），导出文本可能与原文有格式差异但语义一致；若用户图里有大量高级语法，提示以预览为准、谨慎修改。
