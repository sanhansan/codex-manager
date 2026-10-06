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
# 用法: python _mk_editor.py <模板.html> <mermaid源文件> "来源描述" [当前会话ID]
import hashlib, json, sys
tpl = open(sys.argv[1], encoding="utf-8").read()
mermaid = open(sys.argv[2], encoding="utf-8").read()
rev = hashlib.sha1(mermaid.encode("utf-8")).hexdigest()[:10]  # rev 变了编辑器才会用新数据覆盖浏览器旧存档
payload = json.dumps({"mermaid": mermaid, "source": sys.argv[3], "session": (sys.argv[4] if len(sys.argv) > 4 else ""), "exportName": "flow-export.mmd", "rev": rev}, ensure_ascii=False).replace("</", "<\\/")
open("flow-editor.html", "w", encoding="utf-8").write(tpl.replace("/*__FLOW_DATA__*/null", payload, 1))
print("OK")
```

   把第一步拿到的 mermaid 先存成临时 `.mmd` 文件再执行（命令用完删除临时脚本与 `.mmd`）；来源描述写清楚（如 `项目 X 第 3 版` / `当前会话` / 文件路径）。来源是**当前会话**时，把会话 ID（`sess_…`，可从 `%USERPROFILE%\.zcode\codex-manager\usage.jsonl` 最后一条 session 记录取）作为第 4 参数传入——编辑器「💬 问答」视图会用它把该会话的条目标为「🧠 总智能体·画布来源」。

## 第三步：在浏览器打开

- Windows（ZCode 终端实为 cmd）：`start "" "<flow-editor.html 完整路径>"`；macOS 用 `open "<路径>"`。
- **若用户反馈浏览器显示「拒绝访问」/ ERR_ACCESS_DENIED，或文件方式打不开**：改用本地 HTTP 服务兜底（127.0.0.1 不受文件 ACL 与内置浏览器 file:// 限制）：
  1. 后台启动服务：`python -m http.server 8377 --directory "<工作副本所在目录>"`（用后台方式运行，别阻塞会话；端口被占用就换 8378 等）；
  2. 打开 `start "" "http://127.0.0.1:8377/flow-editor.html"`，并把该网址给用户。
  注意：HTTP 方式下「🔗 连接文件」仍可用（Edge/Chrome）。
- 告诉用户编辑器用法（v0.11.0 布局）：**左侧任务栏**可手动切换六个视图——「🖼 画布」编辑当前图（工具栏可加 输入/Agent/Map Agent/条件/合并/输出 六类节点，双击节点在右侧面板改标签/类型/形状/逻辑门/**节点说明**）；「🛰 分布工作区」每张卡片是一个工作流（打开/重命名/删除/导出）；「🧭 总控流程」用关系图 + 关系表查看子流程引用；「🧩 技能总结」「📜 轨迹查询」是独立数据模块；「💬 问答」逐项回放会话问答（每项点 ▼ 展开看完整问答与关键词，徽章区分 🧠 总智能体与 🤖 子智能体，画布来源会话特别标注，每条可一键「添加为画布节点」）。画布内：**拖节点移动**；**从节点圆点拖到另一节点 = 连线**；**拖动连线端点到别的节点 = 改接**；红色边 = 反馈环；**双击空白 = 新建节点**；底部 Mermaid / Markdown / JSON 三页签与画布**双向同步**；`Ctrl+S` 导出 `.mmd`；"✨ 一键整理"去重连线并重排。
- **引导双向同步（code ↔ 网页，强烈推荐）**：打开后让用户点底部「🔗 连接文件」，选择刚才那个 mermaid/Markdown 文件。之后：你在会话里**改文件** → 页面 1~2 秒内自动重画；用户在**画布上改** → 自动写回文件，你读文件即可拿到最新版。**连接过的文件句柄会被记住**：下次再打开编辑器会自动恢复同步（需要授权时点一下「🔗 连接文件」即可），浏览器与 code 侧数据保持一致。要求 Edge/Chrome（File System Access API）；不支持的浏览器会降级为只读载入并提示。
- **数据一致性说明**：工作副本带 rev 指纹，用户用浏览器打开时若 rev 比本地存档新，编辑器会以代码侧注入的最新数据为准（旧存档自动让位）；之后用户的手工修改仍实时保存在本地存档与同步文件里。
- **技能与轨迹可视化**：左侧任务栏「🧩 技能总结」「📜 轨迹查询」可选择 `usage.jsonl`（`%USERPROFILE%\.zcode\codex-manager\usage.jsonl`），本地渲染技能总结（每技能调用次数/占比/最近使用）、调用排行与习惯候选（可复制 Markdown 供 /codex-habit），或按关键字/类型/会话回放每次调用轨迹。
- **问答回放**：「💬 问答」视图选择 `%USERPROFILE%\.zcode\cli\rollout\` 下的会话文件（model-io-sess_*.jsonl）与 `%USERPROFILE%\.zcode\cli\agents\` 下的 sess_* 子智能体目录，即可逐项展开查看**总智能体**（主会话）与**子智能体**（Agent 派生聊天，问=prompt、答=output.txt）的完整问答、关键词与元信息（角色/状态/tokens/耗时）；某条问答对流程有价值时点「→ 添加为画布节点」直接上图。

## 第四步：回写（用户导出后）

- 用户用 `Ctrl+S` 导出（默认 `flow-export.mmd`）后，如需把改好的图存回项目框架 → 按 `/codex-flow-save` 的流程，把导出文件作为 mermaid 源合并进 `flow.json`（生成新的 versions 记录，摘要写明"可视化编辑"）。
- 只是临时改图不需要回写时，到此结束。
- **诚实原则**：编辑器忽略不支持的语法（classDef、嵌套 subgraph 等），导出文本可能与原文有格式差异但语义一致；若用户图里有大量高级语法，提示以预览为准、谨慎修改。
