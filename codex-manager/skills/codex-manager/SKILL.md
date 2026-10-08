---
name: codex-manager
description: Use when the user asks about plugin/skill/MCP usage statistics (插件使用量、使用统计、使用报表、哪个插件用得多、MCP 调用次数), wants to export a usage spreadsheet (导出表格、Excel 报表), wants a work session turned into a flowchart (工作流程图、会话复盘、把这次工作画成流程图), wants to visually edit a flowchart on a canvas (可视化编辑流程图、拖拽改图、画布上改流程图、浏览器里修改流程图), wants to review or improve a work process (流程审查、流程提问、哪些可以省、哪些可以优化、流程改进), wants an end-of-project retrospective with prompt recommendations (项目总结、优化提示词), wants personal habits turned into a skill (个人习惯成 skill、总结成技能), wants a project flow framework built up or aggregated (流程框架、持续搭建、最后汇总), or wants multi-agent / cross-agent review (子智能体审查、跨智能体总结). Backed by automatic usage-logging hooks and the /codex-* commands.
---

# Codex Manager：用量统计、流程审查与持续改进

数据来源：本插件的钩子把每次技能（Skill 工具）调用、MCP 工具调用和会话开始自动追加到
`%USERPROFILE%\.zcode\codex-manager\usage.jsonl`，每行一个 JSON：`ts / kind(skill|mcp|session) / plugin / name / session / cwd`。
项目流程框架（人可编辑）在 `%USERPROFILE%\.zcode\codex-manager\projects\<项目名>\flow.json`。

## 命令路由（按用户意图分发）

| 用户意图 | 执行 |
| --- | --- |
| 使用量 / 统计 / 报表 / 表格 | `/codex-usage`（读日志 → 聚合 → Markdown 表格 + xlsx） |
| 流程图 / 把这次工作画出来 | `/codex-flow`（当前会话直接梳理；历史会话解析 rollout） |
| 可视化编辑 / 拖拽改图 | `/codex-flow-edit`（浏览器画布编辑 → 导出 .mmd → 可用 `/codex-flow-save` 回写框架） |
| 流程审查 / 提问 / 哪些可省可优化 | `/codex-review`（提问式审查 → 类型化推荐表） |
| 项目结束 / 总结 / 优化提示词 | `/codex-optimize`（复盘报告 + 可复用提示词模板） |
| 个人习惯 / 总结成 skill | `/codex-habit`（数据驱动提炼 → 自主编写 SKILL.md） |
| 存进项目框架 / 持续搭建 | `/codex-flow-save`（合并进 flow.json，支持渲染图片） |
| 多个子智能体审查 / 跨智能体总结 | `/codex-agents-review`（3 子智能体并行 → 总智能体汇总 → 沉淀） |
| 最后汇总 / 项目总报告 | `/codex-summary`（总流程图 + 审查闭环报告） |

## 规则

- 只报告真实记录的数据，不编造。日志为空或不存在时如实说明，并提示数据会随使用自动积累。
- 生成的报表/流程图/报告保存到当前工作区或 `projects\<项目名>\`，并在回复中给出完整路径。
- 用户没装 openpyxl 时降级为 CSV，不要安装依赖。
- 流程框架 `flow.json` 是用户可手工编辑的文件：读取时以文件为准，写回时合并而不是覆盖未知字段。
- 审查与汇总结论必须引用真实事件/记录；证据不足时如实标注，不硬造建议。

## 多智能体接入（v0.21.0 起，v0.24.0 增强）

`flow_serve.py` 用「适配器注册表」统一接入所有智能体，不再硬编码单一客户端。
每次启动会打印 `已注册智能体 N 个` 与各自的连接状态。

**v0.24.0 关键行为**（项目维度 + 智能体神经网络）：
- **总控流程文字溢出修复**：`renderCtlMap` 用 `TRUNC(txt, maxPx, fs)` 按像素宽度截断（CJK≈1em、西文≈0.56em）并为每个节点加 `<clipPath>`；`#ctlTable` 改 `table-layout:fixed` + 单元格 `overflow-wrap:anywhere`；`.wfcard` 加 `overflow-wrap:anywhere; min-width:0` 与标题省略号。
- **画布按项目分组**：`projectOf(cwd)` 取工作目录末段为项目名（无 cwd 回落「未标注项目」）；`storeConversationCanvas` 把 `cwd` / `project` 写入 `src`；`groupByProject(list)` 把对话画布按项目归组、非会话画布归入「流程框架」。
- **同项目智能体大框**：`agentsInProject(list, project)` 按客户端聚合出 `{client, canvases, masters, subs}`；左侧列表每个客户端渲染一个彩色「智能体框」（🧠 主智能体 + 🤖 N 子智能体）。
- **同项目跨智能体协作**：`projectCollaboration(list, project)` 按时间序生成接力链 `{links:[{from,to,ts}], clients, events}`，列表显示「🤝 协作链 ZCode→Codex→Gemini」。
- **点击切换与展现重做**：画布顶部面包屑 `#cvCrumb`（📁 项目 › 🤖 智能体 › 🧩 画布，点击展开下拉 `openCrumbMenu`）；全局快速切换 `openQuickSwitch`（`#wfQuickBtn` → 关键字过滤、回车跳转）；`switchWorkflow` 加 `cv-flip` 淡入动效。
- **🧠 智能体总结神经网络视图**（`viewNn`）：v0.27.0 起为 Canvas「文字树图」渲染器（详见下方 v0.27.0 关键行为）；建树 `ntBuildTree(list, qaArr)` → 布局 `ntLayoutTree(root, W, H)` 四层嵌套 squarified treemap（项目 → 智能体 → 会话 → 对话轮）。**v0.27.1 修掉 5 处落地缺陷，详见下方 v0.27.1 关键行为**。

**v0.27.3 关键行为**（画布**边缘图像泄露**修复 + 神经网络**信息增强**；用户诉求原文「画布边界问题导致泄露，神经网络再丰富一些」）：

- **画布边缘图像泄露（根因：SVG 相对弧命令）**：卡片标题区旧实现用 `<path>` 画圆角，d 串里混了**相对弧命令** `A R,R 0 0 0 -R,-R`（终点相对当前点）。该 d 串**语法合法、不报错**，但 `getBBox()` 量出 **245×148**（卡片真实只有 **236×26**），填充多边形**溢出卡片、在画布左侧边缘留下斜切色块**。修复：改为「普通矩形 + `clipPath` 裁到卡片圆角」——每次 `render()` 用自增序号生成唯一 `cvhcN` id（`clipSeq`），`<rect class="nd-head" clip-path="url(#cvhcN)">` 落在 `y..y+headH`，物理上不可能画出卡片外。**排查要点**：这类「无报错的几何错位」用 `getBBox()` 对账是唯一可靠手段，`tests/diag-*.mjs` 系列就是为此写的。
- **同名画布导致神经网络整块空白**：`ntSessionLines` 原为 `(canvasName, list, qaArr)` 且只 `list.find(x => x.name === canvasName)`；当存在**同名但无 `src`** 的画布（命令注入的种子画布 vs 从会话生成的对话画布）时会命中错的那个 → 该会话**一个字都不显示**。现在首参**同时接受画布名与画布对象**（`typeof wOrName === 'object'` 分支），`ntBuildTree` 直接传 `w`。e2e 有专项回归（插入同名无 src 画布后仍须有正文）。
- **着色维度 `#nnColor`**：`client`（默认，智能体本色）/ `time`（冷=早 → 暖=近）/ `load`（浅 → 深）。**只重绘不重建树**（`nnColorMode` 全局 + `ntRectColor(r, th)` 统一取色），作用于智能体底色/边框、会话抬头条与左侧色条、小地图缩略块；图例色点**始终**用智能体本色（身份），模式只写在图例标题行。
- **智能体图例 `#nnLegend`**（左下）：由 `nnTextState.stat.clients` 生成，色点 + 名称 + 会话数；点击 = `nnFilterClient = client` → `renderNn()`，再点取消；过滤态 HUD 追加 `🎯 只看 X ✕` 芯片（点击复位）且图例出现 `#nnLegendReset`「显示全部」。过滤在 `ntBuildTree` 的最前面按 `w.src.client` 生效。
- **小地图 `#nnMini`**（左上，`.nnlod` 下方；**独立 canvas**，避免与主画布 pointer 事件互相干扰）：`ntMiniBox()` 把 `proj` 层包围盒等比映射到小地图，`ntDrawMini()` 每帧画「项目/会话缩略块（颜色跟随着色维度）+ 当前视口框」；点击 → `ntFlyTo(B.wx(mx), B.wy(my), tz)`。尺寸随 DPR 在 `resizeNnCanvas()` 里一起设置（`nnTextState.mw/mh`）。
- **统计 HUD** 3 → 8 芯片：📁项目 / 🧠智能体 / 🧩会话 / 💬对话轮 / 📄文本行 / 🤖子智能体 / 🕒跨度 / fps（口径统一来自 `nnStats(rects)`，存于 `nnTextState.stat`）。
- **富 tooltip**：`proj` → `🧠智能体 · 🧩会话 · 💬轮 · 📄行` + 时间跨度；`sess` → `💬轮 · 🤖子 · 📄行` + `fmtWfWhen(ts)` + 「点击跳转该画布」；`turn` → 「第 N 轮 · 共 M 行」+ **行角色** + 放大提示；`agent` → 「点击只显示该智能体」。注意 `turn` 的命中优先级高于 `sess`，要悬停到**会话抬头条**（顶部 ~10px）才会命中 `sess`。
- **标题条统计徽章**（语言无关符号 + 数字，无需 i18n）：`proj` → `🧩会话 · 📄行`；`sess` → `💬轮 · 🤖子`；`agent` → `🧩会话`。徽章先测量再参与 `maxW` 预算，宽度不够时自动不画，不会与标题重叠。
- **代码块角色色条**：`ntRoleOf(line)` → `ask`（`^问\s*[:：]`）/ `sub`（`^🤖`）/ `ans` / `misc`；布局时写入 `turn.role`，绘制时左侧 2px 色条、纯色块档 `ntMix(..., roleC, 0.30)` 偏色、条带档**逐行**配色、文字档**行号**按角色着色（`ntRoleColor`）。
- **`__CORE` 新增纯函数**：`ntRoleOf` / `ntRoleColor` / `nnStats` / `ntShadeOf` / `ntSpanOf`。
- **视觉验收脚本 `tests/shots-nn-enrich.mjs`**：**file:// + PAYLOAD 注入，绝不连本地服务**——直接对 8380 跑截图脚本会把样例画布 **POST 进 `~/.zcode/codex-manager/wf-backup.json`**（本版踩过并已手工清理，备份留在工作区）。输出 6 张图：总览 / 条带档角色色条 / 文字档角色行号 / 按时间 / 按活跃度 / 图例过滤。

**v0.27.2 关键行为**（画布 UI 四项修复 + 神经网络写入**具体问答**；这一版解决的是「一直在重复标题、重复一句话」以及线条/方框/端口四类手感问题）：

- **神经网络复读的三个根因（叠加起来才显得那么糟，缺一不可）**
  1. **正文只取问题、回答没进去**：`ntSessionLines` 旧实现只 `lines.push(t.q)`，回答正文完全没进正文 → 放大后满屏都是标题。现在 `问：` + `qaTextLines(t.a, …)` + 子智能体输出一起进正文；回答来源 `src.turns[].a`（**v0.27.2 起随画布持久化，`w.src.turns[].a` 截断 400 字**，见 `wfTreeParse` 白名单），回退到问答数据里同会话条目（按 `q.slice(0,24)` 匹配）。
  2. **子智能体写死同一句**：旧实现 `((t.subs)||[]).forEach(() => lines.push('  🤖 子智能体执行'))` → 10 个子智能体复读 10 遍。现在用 `subItemForNode(sn)` 反查真实条目，写它的 `a || description || q`；最后对整段正文**全文去重**（同一句只留一次）。
  3. **`ntPackRows` 循环填充**：旧实现 `pool[i % pool.length]` + `i < pool.length ? t : '  ' + t`，**把同一句复制 N 遍直到铺满整块** —— 这才是「重复一句话」最直接的来源。现在只返回**去重按序的真实行**，内容不足就返回实际行数（布局端尾部留白），绝不复读。`ntPackRows` 已下沉到 `__CORE` 以便单测。
- **配套布局改动**：`ntBuildTree` 正文上限 40 → **240 行**，`snode.codeLines` 与真正会画出来的行数对齐；`ntLayoutTree` 的第四层改为 `rowBudget = min(capRows, packed.length)`，`rowH = sinner.h / capRows`（**行高不变量保持不变，不做拉伸**），`pi >= rowBudget` 的轮直接跳过 → 不再强制占位。新增**内容自适应世界尺寸**：按 `contentRows * NT_ROW_H * 1.2 + heads` 算出 `kScale` 缩放 world，不再把十几行内容拉伸到整个画布。
- **方框显示（4 处）**
  1. **字符数当行数（最严重）**：`cardBodyLines` 旧实现 `if (txt) return txt.length` → 347 字的 doc 算成 347 行 → `n.h = 26+9+347*15+9+16 ≈ 5200px` 的巨框。现在按 `ntCardRows(txt, CARD_W-2*CARD_PAD, CARD_MAX_BODY)` 的**真实折行结果**取行数，并加 `CARD_MAX_BODY = 14` 硬上限。
  2. **正文回退重复标题**：旧回退链 `n.doc || n.body || n.label` 会把标题又写一遍。现在 `cardBodyText(n)` 只认 `doc || body`；没有就收成紧凑卡（`CARD_MIN_BODY = 2`），并在 **`enrichNodeDocs()`** 里用该节点对应的真实问答（`src.turns` 按 `t.node === n.id` 匹配）补齐 `n.doc`。只在缺 doc 时补、不覆盖用户手写，`g._docsFilled` 保证每图只补一次，`refresh()` 里调用。
  3. **标题区色块高出卡片上边框 8px**：旧抬头路径 `M x,(y+headH) h w v -headH a R,R 0 0 0 -R,-R …` 的顶边落在 **`y-R`** 上。现在显式走 `(x+w, y+R) →arc→ (x+w-R, y) →L→ (x+R, y) →arc→ (x, y+R) →Z`，圆角严格落在顶边 `y`，与卡片 `rx=R` 吻合。
  4. **正文压到文件名条**：尺寸侧 `n.file`、渲染侧 `n.file || n.subflow` 判定不一致。现在 `sizeNode` 预算 `n.fileLabel` 与 `n.bodyRows`，渲染**直接复用** → 框高与画出来的文字永远同源（不会再出现大片空白或文字溢出）。
  另：`looksLikeCode(t)` 判定代码型正文，用 `.nd-bcode` 等宽字体。
- **线条规划 / 线条连接**：新增纯函数 **`routeOrtho(p1, p2, {dir, obstacles, a, b, laneIdx, laneCnt, feedback})`**（在 `__CORE`，可单测）：
  - 正走：在两端端口之间**逐档扫描**竖向（LR）/ 横向（TD）通道，用 `polylineFree(pts, obs, skip, 4)` 选**不穿过任何卡片**（留 4px 间隙）的那一条；
  - 受阻或反馈边：**外绕** —— 在 `min/max` 侧逐档外移（LR 走上/下方横向通道，TD 走左/右侧纵向通道），取第一条干净通道；找不到再用兜底通道；
  - **首末段严格沿端口法线**进出（LR 水平、TD 垂直），保证箭头方向正确。
  - 旧实现的两个硬伤：`midX = (p1.x+p2.x)/2 + off` 在两端贴近时 `midX` 落在区间外 → **折返**；平行边分道偏移 `off` 会把通道推过卡片 → **直接穿过中间的方框**。
  - **箭头避让端口**：`edgePath` 里末段沿方向回退 8px（`END_TRIM`），箭头尖停在端口圆点外侧 —— 旧实现箭头整个盖住端口。
- **点（端口）**：`anchors(n)` 给的 `inn/out` 之前渲染成**两个完全相同的圆**（`class="port"`），既看不出方向、`r=4.5` 又几乎点不中。现在可视圆分 `port-in`（空心）/ `port-out`（实心）且 `pointer-events:none`，另加 **r=10 的透明热区 `port-hit`**（`data-port` 挂在热区上，`closest('[data-port]')` 逻辑不变），`g[data-node]:hover .port-*` 放大并变强调色。
- **测试钩子**：`__flow` 新增 `sizeNode / normalize / cardBodyRows / cardBodyText / ntCardRows / qaTextLines / looksLikeCode / routeOrtho / segHitsRect / polylineFree / anchors / edgePath / edgeMeta / refresh / ntPackRows / ntSessionLines / enrichNodeDocs`。
- **诊断脚本**：`tests/diag-canvas.mjs`（导出节点/连线几何）、`tests/diag-card.mjs`（卡片近景 + 数值校验：框高 vs 正文行数、`getBBox` 是否横向溢出、正文底 vs 文件名条顶、箭头尖与端口距离）。

**v0.27.1 关键行为**（神经网络「文字树图」落地修复 + 视觉验收；v0.27.0 只是骨架，实际渲染有 5 个真 bug）：
- **行高语义（最重要）**：一个「对话轮」= **一段多行代码块**（不是一行）。`ntBuildTree` 里 `snode.children[i] = { lines: ntWrapText(q, NT_CODE_COLS*7.5, NT_MAX_LINES, 10), nLines, weight: nLines }`；会话权重 = `codeLines`（各轮 `nLines` 之和）。布局按行数分配高度，使**「一行」在世界坐标里恒为 `NT_ROW_H`(=10)**，对齐 code-map 的 `line_px = line_h × scale`。旧实现一个 rect 占满会话体（35px+）、`fs = h*0.68` 画出巨型单行 → 永远读不到多行代码。
- **LOD 阈值可达性**：`ntRowPx()` 取**所有 turn 的 `h / lines.length` 中位数** × 缩放，作为 `ntUpdateLod` 的「每行像素」。旧实现按 rect 高度算 → 必须缩放到 ~10× 才进文字档；现在 **1.08×** 即可。
- **绘制顺序（关键坑）**：`drawNn` 必须 **先铺父层底色 `['proj','agent','sess']`，最后画 `turn` 文字**。旧实现先画 turn 再画 sess，而 `ntDrawSessionBody` 会 `fillRect` 整个会话 → **把 turn 文字全部擦掉，会话体永远空白**。
- **画布↔布局尺寸一致性**：`renderNn` 在视图未显示时 `box.clientWidth === 0` → 回退 900×620 建树，但画布 backing store 只有 320×240 → 屏幕坐标与世界坐标错位、切过去一片空白。新增 **`ntRelayoutIfNeeded()`**：下一帧复查真实容器尺寸，不一致就整棵重排；`ntFrame` 用 `ntFrame._laid` 保证进入视图后跑一次，`renderNn` 里重置为 0。
- **抬头条双重缩放**：`ntDrawSessionBody` 里 `x/y/w/h` 已是屏幕坐标，`headH` 不能再乘 `z`（旧代码 `Math.max(10, Math.min(h*0.2, 16)) * z` 会让抬头条溢出会话宽度）；改为固定屏幕像素并 `ctx.rect(x,y,w,h); ctx.clip()` 裁到会话矩形。
- **密排代码观感**（对齐参考图1/图2）：新增 **`ntPackRows(rawLines, want)`** —— 会话内各轮文本去重后按容量循环铺满，`capRows = round(会话体高 / NT_ROW_H)`，块内行数按各轮 `nLines` 占比回填；不再出现「少量文字拉在大块空白里」。行号列 + 续行 2 空格缩进 + `ntTokenize` 语法高亮。
- **`ntWrapText` 参数口径坑**：第二个参数是 **像素宽度**（CJK≈14px / 西文≈7.5px），**不是列数**。旧调用 `ntWrapText(q, NT_CODE_COLS, …)` 把 46 当像素 → 中文每行只放 2~3 字。正确写法 `NT_CODE_COLS * 7.5`。
- **视觉验收脚本**：`tests/shots-closeup.mjs`（注入 PAYLOAD 样例工作流 → 截「神经网络总览密排代码树图 / 文字档放大可读代码 / 画布卡片+正交连线 / 分布工作区分框」四张图）。注意 `ntFlyTo` 有 `NT_FLY_K=0.2` 缓动，截图前需直接把 `nnTextView.z/x/y` 落到终点，否则截到飞行中途。
- **回归**：单测 87/87、i18n `missing 0`、`http-caps-guard` 4/4、`inject-guard` 4/4。

**v0.27.0 关键行为**（神经网络彻底重写为「文字代码树图」+ 画布卡片视觉 + 分布工作区，按用户 3 张参考图）：
- **不再是圆点**：删除全部神经元/芯片/突触方案（`nnBuildGraph` / `nnLayout` / `nnRelax` / `nnRadiusOf` 及其 Canvas 渲染器）。改为 **矩形 + 内部文字/代码纹理填充** 的 squarified treemap，层级 `项目 → 智能体 → 会话 → 对话轮`（四层嵌套）。渲染入口 `drawNn(now)`（`#nnCv`）。
- **三档像素级 LOD**（`NT_STRIPS_FROM_PX=0.6` / `NT_TEXT_FROM_PX=9.0`，`line_px = 行高 × 缩放`）：
  - `< 0.6` → **纯色块**（远看只是一片密色纹理）
  - `0.6 ~ 9` → **代码条带**（`ntHash` FNV-1a 生成确定性短横条模拟字符，即参考图1 的密字观感）
  - `≥ 9` → **真实可读文字**（等宽字体 + 左侧行号 + `ntTokenize` 语法高亮：关键字/字符串/数字/注释 + 视口裁剪，即参考图2 放大后可读代码）
  - 左上角 `#nnLod` 实时显示当前档位与倍率（色块档 / 条带档 / 文字档 + `N.NN×`）。
- **面积权重可选**：`#nnLayout` 由旧「四布局」改为「📏 按文字行数 / 💬 按对话轮数 / ▦ 等面积」——直接映射 code-map 的「面积 ∝ 行数」。
- **画布卡片视觉重做**（参考图3）：节点 = 圆角卡片，三段式 **标题区**（色点 + 类型徽章 + 标题）+ **多行正文**（`ntWrapText` 折行）+ **底部文件名条**（`n.file` / `n.subflow`），带 `nd-head` / `nd-headline` 分隔；端口 = 左右两个空心圆 `◯`（`anchors()` 取卡片左/右边缘中点）；连线 = `edgePath` 输出**「横—竖—横」正交折线 + 圆角拐弯**（LR/TD 双方向、平行边分道 `laneIdx`、反馈边外绕走卡片外侧）；条件标签 = 小圆角胶囊（如「否」）。
- **卡片尺寸自适应**：`nodeW()` 固定 `CARD_W=236`；`sizeNode()` 按正文行数算高 `CARD_HEAD + PAD + lines×CARD_LINE + PAD + CARD_FILE`（`cardBodyLines`）；`autoLayout` 的蛇形分支与栅格分支改用**实际高度**（旧版固定 `NODE_H=40`，卡片变高后会重叠），同行按最高卡片居中。
- **分布工作区重做**：`renderDist` 按项目分组「框起来」——`groupByProject` 新增 `frame` / `recent` 字段并改排序（会话项目优先、按会话数↔时间倒序），`agentsInProject` 新增 `first` / `last` / `label` / `color`。项目框 `.pfgroup`（左侧色条 + 项目头 `N 智能体 · M 会话 · 🤖子智能体` + 协作接力芯片链 `ZCode→Codex→Gemini`），框内 `.pfbody` 网格。
- **卡片标题 = 真实对话题目**：不再出现「问答画布」。`distCardHtml` 会话卡片标题取 `sessionTaskName(w.src.session)`（回退 `w.src.task`）；`genQaCanvas` 多会话也改取首问句 + `等 N 会话`（此前多会话一律命名「问答画布」）。
- **当前画布自动跟随**（不是「点哪个哪个才当前」）：新增 `#distFollow` 开关 + `distFollowCurrent(force)`——切画布即 `scrollIntoView` 到可见并加 `.wfcur` / `.flash` 呼吸高亮；`switchWorkflow` 内联动调用。
- **`__CORE` 新增纯函数**（可单测）：`nnSquarify`（squarified treemap，Bruls et al. 2000，贪心行打包 + 最差长宽比 `worst()`）、`ntLinePx`、`ntVisibleChars`、`ntTokenize`、`ntHash`、`ntFocusSetIn`、`ntWrapText`；`QA_CLIENTS` / `qaClientInfo` 一并上移 CORE，供分组/协作/神经网络/UI 共用一份（原先 UI 内重复定义）。
- **坑**：`ntTokenize` 正则里 **注释与字符串必须排在标点之前**，否则 `// 注释` 会被标点组吞掉（回归测试已覆盖）；`ntWrapText` 截断时须在 `break` 后补 `…`，不能在 `break` 前。
- 回归测试 **87/87**（新增 `nnSquarify` 3 项 / `ntLinePx` / `ntVisibleChars` / `ntTokenize` / `ntHash` / `ntFocusSetIn` / `ntWrapText`）；`e2e-nn.mjs` 改为断言文字树图（四层矩形计数 / 不重叠且包含 `/ 三档 LOD / 三种权重 / 点击跳转 / 分布工作区分框与自动跟随）。

**v0.26.0 关键行为**（神经网络功能重写，对齐 Peeter95/code-map）：
- ~~**三档像素级 LOD**：`nnRadiusOf(n)` / `nnLinePx(n, z)`~~ → **已被 v0.27.0 的 `ntLinePx` 取代**（圆点方案整体移除）。
- **每帧硬预算 + 剔除**：`NN_QUAD_BUDGET` 图元上限、屏外 AABB 剔除、亚像素剔除（两维皆 `<0.5px` 跳过）、标签预算 `NN_LABEL_BUDGET=500`（code-map LABEL_BUDGET）、脉冲预算 `NN_PULSE_BUDGET=26`。
- **渲染循环生命周期**：`nnStartLoop()` / `nnStopLoop()` 显式管理 rAF；`document.hidden` 或离开 nn 视图立即 `cancelAnimationFrame`，不再空转占帧（旧版只在帧内 early-return）。
- **对数空间飞行相机**：`NN_FLY_K=0.2` 与 code-map `step_flight` 同款；`nnView.flying` 标记飞行态，滚轮缩放/拖拽即取消飞行；`resize` 自动重排。
- **搜索**：顶部 `#nnSearch` —— 关键字命中金色描边（`#ffd93b`，code-map 搜索匹配色 `(1,0.85,0.2)`）、HUD 显命中数、`Enter` 飞下一个、`Esc` 清空。**v0.27.0 沿用**（函数改名为 `ntRunSearch` / `ntFlyToNextMatch`）。
- ~~**神经元半径严格单调**~~ / ~~**map 微条带**~~ → **v0.27.0 随圆点方案一并移除**（改为矩形 treemap 的文字 LOD）。
- **主题感知**：`ntTheme()` 读 `--canvas` 与 `data-theme`，浅色主题下 Canvas 不再残留暗底（v0.27.0 沿用）。
- ~~回归测试 87/87（`nnRadiusOf` / `nnLinePx`）~~ → v0.27.0 已把这些用例替换为 treemap / 分词 / 折行用例。

**v0.25.0 关键行为**（协作可视 + 神经网络重写）：
- **侧栏两行布局修复字体溢出**：`.wfph` / `.wfah` 改两行——第一行 名称（`.wr1` flex + ellipsis），第二行 计数/角色徽章（可截断带 title）；修掉三处实测溢出（项目头 205px 塞 141px、智能体框头 194px 塞 121px 且 overflow:visible、项目名被挤到 3px）。
- **分布工作区智能体标注 + 一键跳转对话**：`renderDist` 卡片新增 `.agrow` 智能体徽章行（色点+客户端名+🤖子数+💬轮数）与接力方向（⬅从X接手 / X接手➡，来自 `projectCollaboration`）；`data-qa="client|bareSession"` 按钮 → `qaGotoSession(client, sess)`：切问答视图、设 `qaClient`、置 `qaSessFilter`；`qaFilter(items, {sess})` 按裸会话号过滤（子智能体按 parentSession 归入），问答页 `#qaSessClear` 可清除。
- **画布协作链条**：`renderCrumb` 末尾调 `renderCollabStrip(e)` → `#cvCollab`（`#cvwrap` 内、面包屑下方）：同项目多智能体时间序芯片链，当前客户端标「（本画布）」，旁注 从X接手·交给Y；点击芯片 `switchWorkflow` 到该客户端同项目最新画布。
- ~~**神经网络视图重写（Canvas 渲染器，参考 Peeter95/code-map 的 GPU treemap）**~~ → **v0.27.0 已整体重写**：`<canvas id="nnCv">` 保留，但内部从「芯片/神经元/突触 + 四布局」换成「矩形文字树图 + 三档 LOD」，函数前缀由 `nn*` 改为 `nt*`（`ntBuildTree` / `ntLayoutTree` / `drawNn` / `ntFrame`）。旧 `nnBuildGraph` / `nnLayout` / `nnRelax` / `nnSquarify`（旧签名）/ `nnRadiusOf` / `nnLinePx` 均已删除；`nnSquarify` 保留原名但改为标准 squarified 实现并移入 `__CORE`。
- 回归测试 85 项（v0.25.0 时期）；`__flow` 钩子补 `nnState/nnView/nnFitView/nnFlyToNode/nnRelax/nnSquarify`（v0.27.0 改为 `nnTextState/nnTextView/ntFitView/ntFlyToRect/ntRunSearch/ntLinePx` 等）。

**v0.24.2 关键行为**（修复「Token 使用量区块空白」）：
- **HTTP 能力探测与数据载入不依赖 PAYLOAD.watch**：直接打开编辑器（无注入工作副本）时，`initHttpWatch` 仍会请求 `__flow_ping` 设置 `httpCaps` 并自动载入 🪙 Token / 📦 使用量 / ⚙ 设置，并启动 💬 问答自动同步；无 `PAYLOAD.watch` 只跳过「双向文件同步」部分。服务未启动时仍每 4 秒自动重连。
- **「已连接智能体」卡片计数**：主会话/子智能体数字用 `tx()` 填充占位符（`T()` 不做替换，曾显示字面 `{0}/{1}`）。
- 回归守卫：`tests/http-caps-guard.mjs`（4 项）。

**v0.23.0 关键行为**（修复「只显示 ZCode / 重开清空记录 / 同步节点过少」）：
- **问答同步按全量会话**：编辑器 `loadHttpQa` 对每个客户端同步**全部会话**（手动/首次载入上限 `QA_SYNC_CAP_FULL=200`，6 秒自动轮询只补最新 `QA_SYNC_CAP_AUTO=12`），不再只取最新 1 个。
- **单客户端隔离**：逐个客户端 try/catch，任一客户端异常（如 gemini 缺 rel、文件损坏）不再中断其余客户端同步。
- **多格式解析器**：`parseAnyTurns` 新增 `parseWbTurns` / `parseGeminiTurns` / `parseQwenTurns`，把各客户端原始日志解析为统一问答回合（`{q,a,tools,ts}`）：
  - WorkBuddy：`{type:'message', role, content:[{type:'input_text'|'output_text', text}], timestamp}`。
  - Gemini：`USER_INPUT`（正文在 `<USER_REQUEST>…</USER_REQUEST>`）+ `PLANNER_RESPONSE`（`thinking` / `tool_calls`）+ `GENERIC`（`content`）。
  - Qwen：`.runtime.json` 仅元信息 → 登记 1 个会话节点并如实标注「不含对话正文」。
- **gemini 免 rel**：`gemini_content_path` 在未传 `rel` 时自动定位 `.system_generated/logs/transcript.jsonl`。
- **Token 不锁死**：`loadHttpClientUsage` 失败后可 8 秒自动重试；多客户端未载入时 `tokList()` 返回空（显示加载/重试态），不再退化显示「只有 ZCode」。
- **重播种保留会话画布**：rev 变化时保留所有 `src.session` 会话画布与用户手工画布（名字不冲突即保留），不再因工作副本重生成而清空历史。

**已内置的智能体适配器**（按 `ADAPTERS` 顺序）：

| id | 名称 | 数据目录（默认） | 会话形态 | 令牌 |
| --- | --- | --- | --- | --- |
| `zcode` | ZCode | `~/.zcode/cli/rollout` | `model-io-sess_*.jsonl` 扁平文件 | ✅ |
| `codex` | Codex CLI | `~/.codex/sessions` | `YYYY/MM/DD/rollout-*.jsonl` | ✅ |
| `qoder` | Qoder CLI | `~/.qoder-cn` | `projects/<项目>/<会话>.jsonl` + `subagents/` | ❌ 无令牌字段 |
| `gemini` | Gemini (Antigravity) | `~/.gemini/antigravity` | `brain/<uuid>/` 目录树 | ❌ 无令牌字段 |
| `wb` | WorkBuddy | `~/.workbuddy` | `projects/<项目>/<会话>.jsonl` | ✅ |
| `qwen` | Qwen Code | `~/.qwen` | `projects/<项目>/chats/<uuid>.runtime.json` | ❌ 仅元信息 |
| `kimi` | Kimi | `~/.kimi-work` | 无（目录内只有可执行文件） | ❌ 无数据 |

各适配器令牌口径说明：
- **zcode / codex / wb** 有令牌明细，口径统一为「输入 = 净输入（已扣除缓存读）+ 缓存读 + 输出 = 合计」。
  - Codex：`cached_input_tokens` 是 `input_tokens` 的子集，展示时拆出。
  - WorkBuddy：取 `providerData.usage.{inputTokens,outputTokens,totalTokens}`，缓存读取 `inputTokensDetails[].cached_tokens`。
- **qoder / gemini / qwen / kimi** 本地日志无令牌字段，只统计调用次数或会话数，并在 `note` 中如实标注。

**WorkBuddy 适配器细节**：会话文件含完整对话（`type` = message / function_call / reasoning / ai-title 等），
模型名取 `providerData.model`，令牌取 `providerData.usage`。本机实测识别出 deepseek-v4.1-flash、
kimi-k3-1、glm-5.3、minimax-m3 等模型。**v0.23.0 起**其 `message` 记录会被 `parseWbTurns` 解析为问答节点
（本机实测单会话即产出 66 条问答），显著增加画布流程节点。

**Qwen Code 适配器细节**：`chats/<uuid>.runtime.json` 只写运行时会话元信息
（session_id / work_dir / started_at / qwen_version），**不含对话正文**，故只提供会话清单。

**Kimi**：桌面版 `~/.kimi-work` 下只有 `bin/`（可执行文件），没有任何会话存储，
注册表中会显示为「无会话」状态——这是如实标注，不是故障。

**相关端点**：
- `GET /__flow_agents_registry` → 「已连接智能体」分类视图（连接状态 connected/empty/missing + 对话画布统计）
- `GET /__flow_clients` → 各智能体的会话明细（含子智能体，字段带 `group` 分组与 `error`）
- `GET /__flow_client_file?client=&id=&rel=&tail=` → 读会话正文（gemini 需带 `rel` 指定正文相对路径）

**编辑器「🔌 已连接智能体」视图**：按「智能体 → 对话画布」两级分类——上层是各智能体卡片
（连接状态徽章、令牌能力、数据目录、最近活跃），下层是它的会话（🧠 主会话）与子智能体（🤖），
每行可「→ 看问答」转跳问答视图并按该客户端过滤。

**新增一个智能体的步骤**：
1. 写探测函数：`list_xxx_sessions(dir, limit)` 返回会话列表（含 `id/name/session/mtime/file/sub`），
   以及可选的 `scan_xxx_usage(dir, limit)` 返回用量聚合 dict；
2. 在 `ADAPTERS` 里加一条 `_adapter("xxx", "显示名", "xxx_dir", lister, usage, tokens=..., group=...)`；
3. 若需要独立可配置目录：`default_paths()` 加一项、`SETTINGS_KEYS`/`KEY_ATTR` 加键、`Handler` 加类属性、
   `main()` 加 `--xxx` 参数（注意 default_paths 的元组解包要同步加位）、`settings_view()` 的 exists 判断自动生效；
4. `client_session_path()` 加该 id 的路径解析（须做 `os.path.commonpath` 越界校验）；
5. 前端 `flow-editor.html`：`QA_CLIENTS` 加色板、`SET_KEYS` 加键、`setLabel()` 加标签、I18N 补英文。

## Gemini / Antigravity 重要说明

- 一个会话 = `brain/<uuid>/` 一个**目录**（不是单文件），正文在 `.system_generated/logs/transcript.jsonl`。
- **transcript 不含任何令牌字段**（实测只有 `step_index/type/status/created_at/content/thinking`），
  故该适配器 `tokens=False`，只按模型响应步数（`PLANNER_RESPONSE` 等）统计调用次数——**不编造 token 数**。
- 模型名从 `USER_INPUT` 正文的 `<USER_SETTINGS_CHANGE>`（“Model Selection … to X”）尽力提取；
  提取不到时如实标为 `Gemini (未标注)`。
- 若将来版本加入 `usageMetadata`/`promptTokenCount`，解析器会自动识别并把 `tokens` 翻成 `true`。

