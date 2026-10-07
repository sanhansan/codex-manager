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
2. 用 python 生成**工作副本**到当前工作区根目录（`flow-editor.html` + `flow-source.mmd`，每次覆盖，固定文件名）：

```python
# 用法: python _mk_editor.py <模板.html> <mermaid源文件> "来源描述" [当前会话ID]
import hashlib, json, sys
tpl = open(sys.argv[1], encoding="utf-8").read()
mermaid = open(sys.argv[2], encoding="utf-8").read()
rev = hashlib.sha1(mermaid.encode("utf-8")).hexdigest()[:10]  # rev 变了编辑器才会用新数据覆盖浏览器旧存档
payload = json.dumps({"mermaid": mermaid, "source": sys.argv[3], "session": (sys.argv[4] if len(sys.argv) > 4 else ""), "exportName": "flow-export.mmd", "watch": "flow-source.mmd", "rev": rev}, ensure_ascii=False).replace("</", "<\\/")
open("flow-editor.html", "w", encoding="utf-8").write(tpl.replace("/*__FLOW_DATA__*/null", payload, 1))
open("flow-source.mmd", "w", encoding="utf-8").write(mermaid)  # HTTP 自动连接的同步文件（flow_serve.py 负责读写）
print("OK")
```

   把第一步拿到的 mermaid 先存成临时 `.mmd` 文件再执行（命令用完删除临时脚本）；来源描述写清楚（如 `项目 X 第 3 版` / `当前会话` / 文件路径）。来源是**当前会话**时，把会话 ID（`sess_…`，可从 `%USERPROFILE%\.zcode\codex-manager\usage.jsonl` 最后一条 session 记录取）作为第 4 参数传入——编辑器「💬 问答」视图会用它把该会话的条目标为「🧠 总智能体·画布来源」。

## 第三步：启动本地托管并打开（HTTP 自动连接，默认路径）

1. 找到插件自带的 `assets/flow_serve.py`（与模板同目录，查找方式同第二步第 1 点），**后台**启动（别阻塞会话）：

```bash
python "<插件目录>/assets/flow_serve.py" --dir "<工作副本所在目录>" --watch flow-source.mmd --port 8380
# 只绑定 127.0.0.1；写回目标固定为工作目录内的 flow-source.mmd；端口被占用会自动换 8381、8382…（以 stdout 的 FLOW_SERVE_URL= 为准）
# 用量数据默认路径无需传参：--usage "%USERPROFILE%\.zcode\codex-manager\usage.jsonl"、--rollout "%USERPROFILE%\.zcode\cli\rollout"、--codex "%USERPROFILE%\.codex\sessions"、--qoder "%USERPROFILE%\.qoder-cn"（三家客户端随扫描自动识别，可覆盖）
```

2. 打开 `start "" "http://127.0.0.1:8380/flow-editor.html"`（URL 以服务打印的 `FLOW_SERVE_URL=` 为准），并把该网址给用户。

打开后编辑器会**零点击自动连接** `flow-source.mmd`（底部状态显示「🌐 flow-source.mmd（HTTP 自动连接 · 双向）」）：你在会话里**改 `flow-source.mmd`** → 页面 1~2 秒内自动重画；用户在**画布上改** → 自动 POST 写回该文件（临时文件 + 原子替换），你读文件即可拿到最新版——**不需要任何浏览器授权**（file:// 下的 File System Access 方案做不到零点击，这是 HTTP 托管的意义）。**断线自愈**：服务断开/重启时状态栏提示「⚠ 本地服务未连接：画布不会自动同步。启动 python flow_serve.py… 后每 4 秒自动重连」并自动重试（轮询连续失败判定断连），服务恢复后双向同步与问答同步自动续上。
- **兜底一（文件方式）**：`start "" "<flow-editor.html 完整路径>"`（macOS 用 `open`）——无自动连接，用户可手动点「🔗 连接文件」（Edge/Chrome）。
- **兜底二（用户反馈「拒绝访问」/ ERR_ACCESS_DENIED）**：`python -m http.server <端口> --directory "<目录>"`（无 `/__flow_ping` 端点 → 编辑器降级为「👁 HTTP 只读」：AI 改文件仍自动重画，画布改动只存本地存档并在状态栏提示）。
- 告诉用户编辑器用法（v0.16.0 布局）：顶栏 **🌐 EN / 🌐 中文** 一键切换整套界面语言（偏好记忆）；**左侧任务栏**可手动切换六个视图——「🖼 画布」编辑当前图（工具栏可加 输入/Agent/Map Agent/条件/合并/输出 六类节点，**「＋框架」一键把 输入→Agent→条件→合并→输出 骨架插入当前画布**，单击节点在右侧面板改标签/类型/形状/逻辑门/**节点说明**，**双击节点或选中按 F2 = 就地改标签**，悬浮输入框 Enter 提交 / Esc 取消）；「🛰 分布工作区」每张卡片是一个工作流（打开/重命名/删除/导出）；「🧭 总控流程」用关系图 + 关系表查看子流程引用，并含**📦 使用量区块**（插件/技能/MCP KPI、插件使用量排行与明细表）与**🪙 Token 使用量区块（多客户端：ZCode / Codex CLI / Qoder CLI）**（合并 KPI、客户端筛选 chips、**按日/按月切换**、**折线图悬停显示「合计 + 各客户端分解」**、**点击数据点出「周期明细」卡**——期间每客户端模型用量表 + 活跃会话表、行内「→ 查看问答」一键转跳并定位该会话、客户端模型用量合并表、**按插件（Token 归属：触发/承接该插件工具的调用计入该插件、与总量逐位对账）**、**按会话**——点行展开「按日明细 + 按插件分摊」）——HTTP 托管下这两份数据**打开即自动载入，零点击**（数据源：usage.jsonl + `%USERPROFILE%\.zcode\cli\rollout\` + `%USERPROFILE%\.codex\sessions` + `%USERPROFILE%\.qoder-cn`）；**「🧩 Agent Skills」**（原技能总结）是独立数据模块且含 **🛠 Skill 工坊**（「✨ 从习惯候选生成草稿」按用量、「✨ 从问答/提示词生成草稿」按当前问答数据自动写出 SKILL.md → 编辑 → 「⬇ 导出 SKILL.md」直接下载 → 「💾 保存到草稿目录」/「📦 保存并安装到插件」，安装后**智能体可用 Skill 工具直接调用**（已安装列表行带 ✅ 标记），已保存列表点行载回；保存/安装走 flow_serve.py 的技能端点，草稿目录 `~/.zcode/codex-manager/skills/`、安装目录为插件 `skills/`）；「📜 轨迹查询」按关键字/类型/会话回放每次调用；「💬 问答」**启动即自动同步**三家客户端的最新会话 + 全部子智能体（ZCode / Codex CLI / Qoder CLI，6 秒轮询，无需手动选文件；也保留手动选择/粘贴），每条带**客户端色徽章**（ZCode 蓝 / Codex CLI 青 / Qoder 紫），顶部**关键词总览条**（🧠 任务关键字 / 🤖 子智能体关键字）点击即过滤，可「📝 生成提示词总结」——中英双语 Markdown，支持复制与「⬇ 导出 .md」；**「⚡ 一键重点与提示词」**自动打分提取重点并汇总可复用提示词（无需人工标注），**「🖼 生成工作画布」**把问答变成工作画布（🧠 总任务链 + 🤖 子智能体虚线挂载，可 Ctrl+Z 撤销）；每项点 ▼ 展开看完整问答与关键词，徽章区分 🧠 总智能体与 🤖 子智能体（子智能体行显示 profile 并有紫色左边条、总智能体为蓝色），画布来源会话特别标注，每条可一键「添加为画布节点」，行内「→ 查看 X 用量」反向转跳 Token 区块并按客户端过滤。画布内：**拖节点移动**；**从节点圆点拖到另一节点 = 连线**；**拖动连线端点到别的节点 = 改接**；红色边 = 反馈环；**双击空白 = 新建节点**；底部 Mermaid / Markdown / JSON 三页签与画布**双向同步**；`Ctrl+S` 导出 `.mmd`；"✨ 一键整理"去重连线并重排。
- **双向同步总览**：HTTP 自动连接（flow_serve.py）是默认路径，零点击；「🔗 连接文件」（File System Access API，要求 Edge/Chrome）是文件方式下的备选——选择 mermaid/Markdown 源文件后双向同步（回写只更新 mermaid 代码块，保住报告结构），**连接过的文件句柄会被记住**，下次打开自动恢复；两种通道互斥（连了文件句柄则 HTTP 让位，断开后自动回到 HTTP）。
- **数据一致性说明**：工作副本带 rev 指纹，用户用浏览器打开时若 rev 比本地存档新，编辑器会以代码侧注入的最新数据为准（旧存档自动让位）；之后用户的手工修改仍实时保存在本地存档与同步文件里。
- **技能与轨迹可视化**：左侧任务栏「🧩 Agent Skills」「📜 轨迹查询」「🧭 总控流程」共用一份用量数据，可选择 `usage.jsonl`（`%USERPROFILE%\.zcode\codex-manager\usage.jsonl`），本地渲染 Agent Skills 总结（每技能调用次数/占比/最近使用）、插件使用量排行、调用排行与习惯候选（可复制 Markdown 供 /codex-habit），或按关键字/类型/会话回放每次调用轨迹。「🧩 Agent Skills」里的 **🛠 Skill 工坊**在 HTTP 托管下还能把改好的 SKILL.md **保存到草稿目录或直接安装进插件**（服务端端点：`GET /__flow_skills` 列表、`GET /__flow_skill?slug=&src=` 读取、`POST /__flow_skill` 原子写入，slug 强制 `^[a-z0-9][a-z0-9-]{0,63}$`）；安装进插件后，智能体在工作时可直接用 Skill 工具调用该技能。
- **问答自动同步（v0.16.0 多客户端）**：「💬 问答」视图在 HTTP 托管下**启动即自动载入三家客户端的最新会话与全部子智能体**——ZCode 最新会话（`/__flow_clients` 首选与会话 ID 匹配者）、Codex CLI 最新 rollout、Qoder CLI 最新会话 + 其全部 subagents；每 6 秒轻量轮询一次（页面隐藏时暂停、仅在有新内容时重取、按 问+时间 去重原地更新），状态条实时显示「🔄 已同步 · ZCode / Codex CLI / Qoder CLI · 子智能体 N 个」；file:// 下仍可手动选择 `%USERPROFILE%\.zcode\cli\rollout\` 下的会话文件（model-io-sess_*.jsonl）与 `%USERPROFILE%\.zcode\cli\agents\` 下的 sess_* 子智能体目录。每条问答带**客户端色徽章**；逐项展开查看**总智能体**（主会话）与**子智能体**（Agent 派生聊天，问=prompt、答=output.txt）的完整问答、关键词与元信息（角色/状态/tokens/耗时）；顶部**关键词总览条**（🧠 任务关键字 / 🤖 子智能体关键字，词频排序）点击即过滤，「📝 生成提示词总结」可导出中英双语 Markdown；**「⚡ 一键重点与提示词」**自动打分提取重点（无需标注），**「🖼 生成工作画布」**按 🧠/🤖 生成工作画布（可撤销）；某条问答对流程有价值时点「→ 添加为画布节点」直接上图，或点行内「→ 查看 X 用量」反向转跳 Token 区块。
- **多客户端 Token 数据（v0.16.0，服务端端点）**：`GET /__flow_clients`（三家会话列表：id/name/session/size/mtime/sub/parent）、`GET /__flow_client_file?client=&id=&tail=`（原文，tail 钳制 256KB–16MB）、`GET /__flow_client_usage`（三家聚合：totals/byDay/byDayModel/byModel/bySession；口径统一 输入=净输入、缓存读单列，保证「输入 + 缓存读 + 输出 = 合计」；Qoder 无令牌数时 `tokens:false` + note 如实标注）。**从周期明细「→ 查看问答」转跳**时，编辑器会自动按需拉取该会话原文并过滤定位（纯 tail/delta 分片记录也能解析出提问——`parseQaTurns` 按 `messageOffset` 合并全部窗口）。

## 第四步：回写（用户导出后）

- 用户用 `Ctrl+S` 导出（默认 `flow-export.mmd`）后，如需把改好的图存回项目框架 → 按 `/codex-flow-save` 的流程，把导出文件作为 mermaid 源合并进 `flow.json`（生成新的 versions 记录，摘要写明"可视化编辑"）。
- 只是临时改图不需要回写时，到此结束。
- **诚实原则**：编辑器忽略不支持的语法（classDef、嵌套 subgraph 等），导出文本可能与原文有格式差异但语义一致；若用户图里有大量高级语法，提示以预览为准、谨慎修改。
