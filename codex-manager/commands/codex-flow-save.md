---
description: 把当前会话流程存入项目流程框架（持续搭建、可编辑扩展），并渲染流程图图片
argument-hint: "项目名 [；render 可选渲染图片]"
---

用户要把本次工作存入某个项目的**流程框架**，实现同一项目下的持续性总结搭建。框架文件是人和 AI 都能改的 JSON：`%USERPROFILE%\.zcode\codex-manager\projects\<项目名>\flow.json`。

## 第一步：梳理当前会话流程

按 `/codex-flow` 模式 A 的规则，从当前对话提取：用户需求、各阶段工具调用（含次数）、关键分支、产出。

## 第二步：合并进项目框架（inline python）

把下面脚本保存为 `_flow_save.py` 执行：`python _flow_save.py "<项目名>" "<本次 mermaid 文本文件>" "<阶段JSON文件>" "<一句话摘要>"`（摘要来自第一步的梳理，说明本次做了什么）。脚本逻辑：读取（或创建）flow.json → `versions` 追加一条 `{"ts", "source": "session", "summary", "mermaid"}` → `stages` 按名称合并（同名阶段 `count` 累加、`tools` 并集，新阶段追加）→ 写回（UTF-8 缩进）。执行后删除临时文件。

```python
# 用法: python _flow_save.py <项目名> <mermaid文件> <stages.json文件> [一句话摘要]
import json, os, sys
from datetime import datetime
if len(sys.argv) < 4:
    print("用法: python _flow_save.py <项目名> <mermaid文件> <stages.json文件> [一句话摘要]")
    sys.exit(2)
base = os.path.join(os.path.expanduser("~"), ".zcode", "codex-manager", "projects", sys.argv[1])
os.makedirs(base, exist_ok=True)
fp = os.path.join(base, "flow.json")
data = {"project": sys.argv[1], "updated": "", "versions": [], "stages": [], "reviews": [], "habits": [], "prompt_recommendations": [], "agent_summaries": []}
if os.path.exists(fp):
    with open(fp, encoding="utf-8") as f:
        data.update(json.load(f))
now = datetime.now().astimezone().isoformat(timespec="seconds")
mermaid = open(sys.argv[2], encoding="utf-8").read()
stages = json.load(open(sys.argv[3], encoding="utf-8"))
summary = (sys.argv[4].strip() if len(sys.argv) > 4 else "") or "（本次未提供摘要）"
data["versions"].append({"ts": now, "source": "session", "summary": summary, "mermaid": mermaid})
idx = {s["name"]: s for s in data["stages"]}
for s in stages:
    if s["name"] in idx:
        idx[s["name"]]["count"] = idx[s["name"]].get("count", 1) + s.get("count", 1)
        idx[s["name"]]["tools"] = sorted(set(idx[s["name"]].get("tools", [])) | set(s.get("tools", [])))
    else:
        data["stages"].append(s)
data["updated"] = now
with open(fp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("SAVED:", fp, "| versions:", len(data["versions"]), "| stages:", len(data["stages"]))
```

`stages.json` 结构：`[{"name": "阶段名", "count": 调用次数, "tools": ["Bash", "Edit"]}]`，由第一步的梳理结果生成。

## 第三步：渲染流程图图片（可选，参数含 render 或用户要图时）

按顺序尝试，成功即停：
1. **在线渲染服务**（最稳）：把 mermaid 文本存为 `_flow.mmd`，执行 `curl -s -X POST https://kroki.io/mermaid/png -H "Content-Type: text/plain" --data-binary @_flow.mmd -o "flow-<项目名>-<YYYYMMDD-HHMM>.png"`，检查文件头是否为 PNG；
2. **本地渲染**：`npx -y @mermaid-js/mermaid-cli -i _flow.mmd -o flow.png`（需已装 Node）；
3. **AI 生图**：若当前会话确有可用的图像生成工具（本应用内置或任意 mcp 图像工具），可调用它生成一张**示意版**流程海报，但要注明"AI 生图仅供展示，节点文字以 mermaid 源为准"；
4. 全部失败：如实说明，给出 mermaid 源文件路径（可在 mermaid.live 手动渲染）。

## 第四步：呈现

回复：本次存入的阶段清单、项目框架当前累计状态（versions 数、stages 总数）、flow.json 路径（**提示：该 JSON 可手工编辑修改与扩展，下次搭建会基于修改后的版本**）、图片路径（如已渲染）。

**询问打开编辑器**：呈现后**询问用户**「要在浏览器里打开可视化编辑器查看/继续编辑吗？」——同意则按 `/codex-flow-edit` 的流程，把本次存入的 mermaid 注入编辑器副本并打开，并提示可在编辑器里点「🔗 连接文件」选中本项目的 mermaid 文件实现 code↔网页双向同步。
