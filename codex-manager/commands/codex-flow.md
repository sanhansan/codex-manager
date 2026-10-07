---
description: 把一次工作会话转化为 Mermaid 流程图（默认当前会话，也可选最近/指定历史会话）
argument-hint: "[可选：recent = 最近一次会话，或会话 ID 片段；不填 = 当前会话]"
---

用户要把一次工作转化为流程图。根据参数分两种模式：

## 模式 A：当前会话（无参数时）

1. 回顾当前对话，梳理出：用户的最初需求 → 各工作阶段（按工具调用归类：搜索/读文件/写代码/运行测试/生成文档等）→ 关键分支与转折（重试、纠错、方案取舍）→ 最终产出与结果。
2. 画 Mermaid `flowchart TD`：节点 4~12 个、中文标签不超过 20 字；标签写**具体任务/阶段目标**（动词短语，如「检索资料」「修复统计脚本」），不要用工具名×次数（如 `exec ×44`）、命令或代码片段当标签（这些放节点说明里）；同一阶段的节点用 `subgraph` 分组；判断/分支用菱形 `{}`；结尾节点标注产出物。
3. 把流程图保存为 `codex-flow-YYYYMMDD-HHMMSS.md`（当前工作区根目录），文件内容 = 标题 + 一句话摘要 + ```` ```mermaid ```` 代码块。回复中同时内嵌该 mermaid 代码块，并给出文件完整路径（用户可在 GitHub/VS Code/mermaid.live 预览）。

## 模式 B：历史会话（参数为 recent 或会话 ID 片段）

1. 找会话文件：目录 `%USERPROFILE%\.zcode\cli\rollout\` 下的 `model-io-sess_*.jsonl`。参数为 `recent` 取修改时间最新的一个；否则取文件名包含该 ID 片段的文件。找不到就如实告知并停止。
2. 把下面的脚本原样保存为 `_codex_session_flow.py`，执行 `python _codex_session_flow.py "<会话文件完整路径>"`。脚本按顺序输出事件 JSON 行：
   - `{"type":"meta",...}`：会话 ID、消息总数、覆盖范围；
   - `{"type":"prompt",...}`：用户指令；`{"type":"tool",...}`：工具调用（hint 为关键参数）；
   - 若出现 `{"type":"gap","skipped":N}`：表示开头与最近窗口之间有 N 条消息未被记录，绘图时在图注注明"中段省略"，不要编造。
3. 基于事件流按模式 A 的规则绘制流程图：把连续的工具调用按阶段合并分组，不要每个工具一个节点；文件名用 `codex-flow-<会话ID前8位>-YYYYMMDD.md`。回复中内嵌 mermaid 并给出文件路径。
4. 删除临时脚本 `_codex_session_flow.py`。

**询问打开编辑器（两种模式通用）**：流程图生成后，**询问用户**「要在浏览器里打开可视化编辑器查看/润色吗？」——同意则按 `/codex-flow-edit` 的流程把刚生成的 mermaid 注入编辑器副本并打开；拒绝则只给文件路径结束。

**诚实原则**：只依据真实读到的事件/上下文绘图；meta 里 total 与实际事件数差距很大时，主动说明覆盖范围。

```python
# 用法: python _codex_session_flow.py <model-io-sess_xxx.jsonl>
# 按顺序打印会话中的用户指令与工具调用事件（JSON Lines）。
# 会话记录每行是一次模型请求：request.messages 是消息窗口（full=从头 / tail=最近窗口），
# request.messageOffset 是窗口在全部消息中的起点。脚本用"最后一次 full 行 + 最后一行"拼出开头与结尾。
import json
import re
import sys


def text_hint(args):
    if not isinstance(args, dict):
        return ""
    for k in ("file_path", "path", "command", "skill", "pattern", "description", "url", "query", "code"):
        v = args.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()[:80]
    return ""


def scan_line_meta(line):
    def grab(pat):
        m = re.search(pat, line)
        return m.group(1) if m else None

    return {
        "source": grab(r'"querySource":"([^"]*)"') or "",
        "kind": grab(r'"messagesKind":"([^"]*)"') or "",
        "offset": int(grab(r'"messageOffset":(\d+)') or 0),
        "count": int(grab(r'"messageCount":(\d+)') or 0),
    }


def emit_events(msgs, start_idx, limit_idx, emit):
    for j, m in enumerate(msgs):
        idx = start_idx + j
        if limit_idx is not None and idx >= limit_idx:
            break
        role = m.get("role")
        content = m.get("content")
        if role == "user":
            if isinstance(content, str):
                t = content.strip()
                if t and not t.startswith("<"):
                    emit({"type": "prompt", "label": t[:80], "i": idx})
            elif isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "text":
                        t = (b.get("text") or "").strip()
                        if t and not t.startswith("<"):
                            emit({"type": "prompt", "label": t[:80], "i": idx})
        elif role == "assistant":
            calls = m.get("toolCalls") or m.get("tool_calls") or []
            if isinstance(calls, list) and calls:
                for c in calls:
                    if not isinstance(c, dict):
                        continue
                    name = c.get("name") or (c.get("function") or {}).get("name") or "?"
                    args = c.get("input")
                    if args is None:
                        raw = (c.get("function") or {}).get("arguments")
                        if isinstance(raw, str):
                            try:
                                args = json.loads(raw)
                            except Exception:
                                args = {}
                    emit({"type": "tool", "name": str(name), "hint": text_hint(args), "i": idx})
            elif isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        emit({"type": "tool", "name": str(b.get("name", "?")), "hint": text_hint(b.get("input") or {}), "i": idx})


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        print("用法: python _codex_session_flow.py <会话.jsonl>")
        sys.exit(2)

    last_line = ""
    best_full = {}  # querySource -> (消息数, 该来源下消息数最多的 full 行，覆盖会话开头)
    last_meta = {}
    with open(sys.argv[1], encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            last_line = line
            meta = scan_line_meta(line)
            last_meta = meta
            if meta["kind"] == "full":
                cur = best_full.get(meta["source"], (-1, ""))
                if meta["count"] > cur[0]:
                    best_full[meta["source"]] = (meta["count"], line)

    if not last_line.strip():
        print("EMPTY")
        return
    # 只取与最后一行同 querySource 的 full 行，避免把其他来源的窗口拼进来；来源缺失时回退到全局最大。
    if last_meta.get("source") in best_full:
        _, best_full_line = best_full[last_meta["source"]]
    elif best_full:
        _, best_full_line = max(best_full.values())
    else:
        best_full_line = ""
    obj = json.loads(last_line)
    req = obj.get("request", {})
    msgs = req.get("messages")
    if not isinstance(msgs, list):
        msgs = req.get("body", {}).get("messages", [])
    if not isinstance(msgs, list) or not msgs:
        print("EMPTY")
        return
    t_offset = req.get("messageOffset", 0)

    def emit(ev):
        print(json.dumps(ev, ensure_ascii=False))

    sid = str(obj.get("sessionId") or "")
    covered = 0
    fmsgs = []
    if best_full_line and best_full_line is not last_line:
        try:
            fobj = json.loads(best_full_line)
            fmsgs = fobj.get("request", {}).get("messages", [])
            if not isinstance(fmsgs, list):
                fmsgs = []
            covered = min(len(fmsgs), t_offset)
        except Exception:
            fmsgs = []
            covered = 0
    # meta 和 gap 放在事件流最前面，方便先看到覆盖范围再看事件。
    emit({"type": "meta", "session": sid, "total": last_meta.get("count", len(msgs) + t_offset), "from": covered})
    if t_offset - covered > 0:
        emit({"type": "gap", "skipped": t_offset - covered})
    emit_events(fmsgs, 0, t_offset, emit)
    emit_events(msgs, t_offset, None, emit)
    print("DONE")


main()
```
