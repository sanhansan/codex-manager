#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Codex Manager — OpenAI Codex CLI 适配核心。

功能：
  usage  扫描 ~/.codex/sessions 的 rollout 会话记录，聚合 MCP 服务器 / 工具用量并导出报表。
  flow   提取一次会话的事件流（用户指令 + 工具调用），生成 Mermaid 流程图或 JSON 事件。

适配 codex-cli 0.157.x 的 rollout 记录格式：
  response_item/message(role=user|assistant|developer)
  response_item/function_call(name, namespace="mcp__server"|其他, arguments=JSON字符串)
  response_item/custom_tool_call(name, input)
  token_usage_record / event_msg:token_count —— 令牌用量（取每会话最后一条累计值）
  session_meta / event_msg:task_started|task_complete / compacted

本文件无第三方依赖；openpyxl 仅在导出 xlsx 时按需导入。
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

DEFAULT_SESSIONS_DIR = os.path.join(os.path.expanduser("~"), ".codex", "sessions")
INDEX_FILE = os.path.join(os.path.expanduser("~"), ".codex", "session_index.jsonl")

HINT_KEYS = ("file_path", "path", "command", "skill", "pattern", "description",
             "url", "query", "title", "task_name", "page", "code")

SKIP_PROMPT_PREFIXES = ("<environment_context>", "<app-context", "<external_",
                        "<user_instructions", "<turn_context", "<system")


# ---------------------------------------------------------------- discovery

def find_sessions(sessions_dir=None):
    d = sessions_dir or DEFAULT_SESSIONS_DIR
    found = []
    if os.path.isdir(d):
        pattern = os.path.join(d, "**", "rollout-*.jsonl")
        found = sorted(glob.glob(pattern, recursive=True))
    return found


def load_thread_names():
    names = {}
    try:
        with open(INDEX_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                    if o.get("id"):
                        names[o["id"]] = o.get("thread_name") or ""
                except Exception:
                    pass
    except OSError:
        pass
    return names


# ---------------------------------------------------------------- parsing

def _text_hint(args):
    if isinstance(args, str):
        return args.strip()[:80]
    if isinstance(args, dict):
        for k in HINT_KEYS:
            v = args.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()[:80]
    return ""


def _safe_json(s):
    try:
        return json.loads(s)
    except Exception:
        return None


def parse_session(path, thread_names=None):
    """解析单个 rollout 文件，返回会话摘要 dict。"""
    sid = ""
    m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$", path)
    if m:
        sid = m.group(1)
    sess = {
        "file": path,
        "id": sid,
        "thread_name": (thread_names or {}).get(sid, ""),
        "started": None,
        "ended": None,
        "cwd": "",
        "prompts": [],            # [{ts, text}]
        "calls": [],              # [{ts, kind, namespace, name, hint}]
        "tokens": {"input": 0, "output": 0, "cached": 0, "reasoning": 0},
        "turns": 0,
        "compactions": 0,
        "last_agent_message": "",
    }
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except Exception:
                continue
            ts = o.get("timestamp")
            t = o.get("type")
            p = o.get("payload") if isinstance(o.get("payload"), dict) else {}
            if ts:
                sess["started"] = sess["started"] or ts
                sess["ended"] = ts
            if t == "session_meta":
                sid2 = str(p.get("session_id") or "")
                if sid2:
                    sess["id"] = sid2
                    if not sess["thread_name"]:
                        sess["thread_name"] = (thread_names or {}).get(sid2, "")
                if p.get("cwd"):
                    sess["cwd"] = str(p.get("cwd"))
            elif t == "turn_context":
                if p.get("cwd") and not sess["cwd"]:
                    sess["cwd"] = str(p.get("cwd"))
            elif t == "event_msg" and p.get("type") == "task_started":
                sess["turns"] += 1
            elif t == "event_msg" and p.get("type") == "task_complete":
                msg = p.get("last_agent_message")
                if isinstance(msg, str) and msg.strip():
                    sess["last_agent_message"] = msg.strip()[:120]
            elif t == "compacted":
                sess["compactions"] += 1
            elif t == "token_usage_record":
                u = p.get("total_token_usage") or {}
                if u.get("input_tokens") is not None:
                    sess["tokens"] = {
                        "input": int(u.get("input_tokens") or 0),
                        "output": int(u.get("output_tokens") or 0),
                        "cached": int(u.get("cached_input_tokens") or 0),
                        "reasoning": int(u.get("reasoning_output_tokens") or 0),
                    }
            elif t == "event_msg" and p.get("type") == "token_count":
                u = (p.get("info") or {}).get("total_token_usage") or {}
                if u.get("input_tokens") is not None and sess["tokens"]["input"] == 0:
                    sess["tokens"] = {
                        "input": int(u.get("input_tokens") or 0),
                        "output": int(u.get("output_tokens") or 0),
                        "cached": int(u.get("cached_input_tokens") or 0),
                        "reasoning": int(u.get("reasoning_output_tokens") or 0),
                    }
            elif t == "response_item":
                pt = p.get("type")
                if pt == "message" and p.get("role") == "user":
                    for b in p.get("content") or []:
                        if isinstance(b, dict) and b.get("type") in ("input_text", "text"):
                            txt = str(b.get("text") or "").strip()
                            if txt and not txt.startswith(SKIP_PROMPT_PREFIXES):
                                sess["prompts"].append({"ts": ts, "text": txt[:120]})
                elif pt == "function_call":
                    name = str(p.get("name") or "?")
                    ns = str(p.get("namespace") or "")
                    args = _safe_json(p.get("arguments") or "")
                    sess["calls"].append({
                        "ts": ts, "kind": "mcp" if ns.startswith("mcp__") else "builtin",
                        "namespace": ns, "name": name, "hint": _text_hint(args),
                    })
                elif pt == "custom_tool_call":
                    sess["calls"].append({
                        "ts": ts, "kind": "custom", "namespace": "",
                        "name": str(p.get("name") or "?"),
                        "hint": _text_hint(p.get("input")),
                    })
    return sess


def load_all(sessions_dir=None, days=None):
    names = load_thread_names()
    sessions = []
    for p in find_sessions(sessions_dir):
        try:
            sessions.append(parse_session(p, names))
        except Exception:
            continue
    if days is not None:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        keep = []
        for s in sessions:
            ts = s.get("started") or ""
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                if dt >= cutoff:
                    keep.append(s)
            except Exception:
                continue
        sessions = keep
    return sessions


# ---------------------------------------------------------------- usage

def aggregate_usage(sessions):
    """按 (大类, 归属, 名称) 聚合调用；返回 (detail_rows, kind_totals, totals)。"""
    agg = {}
    kind_totals = defaultdict(int)
    totals = {"sessions": len(sessions), "turns": 0, "calls": 0,
              "input": 0, "output": 0, "cached": 0, "reasoning": 0}
    for s in sessions:
        totals["turns"] += s["turns"]
        for k in ("input", "output", "cached", "reasoning"):
            totals[k] += s["tokens"][k]
        for c in s["calls"]:
            totals["calls"] += 1
            kind_totals[c["kind"]] += 1
            if c["kind"] == "mcp":
                owner = c["namespace"][5:] or "(unknown)"
                cat, label = "MCP 服务器", owner
                name = c["name"]
            elif c["kind"] == "builtin":
                cat, label = "内置命名空间", c["namespace"] or "(core)"
                name = c["name"]
            else:
                cat, label = "内置工具", "(native)"
                name = c["name"]
            key = (cat, label, name)
            a = agg.setdefault(key, {"count": 0, "sessions": set(), "last": ""})
            a["count"] += 1
            if s["id"]:
                a["sessions"].add(s["id"])
            if (c["ts"] or "") > a["last"]:
                a["last"] = c["ts"] or ""
    detail = sorted(
        ((k, a["count"], len(a["sessions"]), a["last"]) for k, a in agg.items()),
        key=lambda x: -x[1],
    )
    return detail, dict(kind_totals), totals


def render_usage_markdown(sessions, detail, kind_totals, totals, scope):
    lines = [f"统计范围：{scope}；会话 {totals['sessions']} 个，回合 {totals['turns']} 次，"
             f"工具调用 {totals['calls']} 次（MCP {kind_totals.get('mcp', 0)} / "
             f"内置 {kind_totals.get('builtin', 0)} / 自定义 {kind_totals.get('custom', 0)}）。",
             f"令牌消耗：输入 {totals['input']:,}（含缓存命中 {totals['cached']:,}），"
             f"输出 {totals['output']:,}，推理 {totals['reasoning']:,}。"]
    if any(s.get("compactions") for s in sessions):
        lines.append("注：部分会话经历过上下文压缩（compaction），令牌为该会话最后一次上下文窗口的累计值。")
    lines.append("")
    lines += ["| 大类 | 归属 | 工具 | 调用次数 | 会话数 | 最近调用 |",
              "| --- | --- | --- | ---: | ---: | --- |"]
    for (cat, label, name), count, sess, last in detail:
        lines.append(f"| {cat} | {label} | {name} | {count} | {sess} | "
                     f"{str(last).replace('T', ' ')[:19]} |")
    return "\n".join(lines)


def export_xlsx(sessions, detail, totals, out_path):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    fill = PatternFill("solid", fgColor="10A37F")  # OpenAI 绿

    def style_header(ws):
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = fill
            c.alignment = Alignment(horizontal="center")

    ws = wb.active
    ws.title = "使用明细"
    ws.append(["大类", "归属", "工具", "调用次数", "涉及会话数", "最近调用"])
    style_header(ws)
    for (cat, label, name), count, sess, last in detail:
        ws.append([cat, label, name, count, sess, str(last).replace("T", " ")[:19]])
    for i, w in enumerate([14, 22, 24, 10, 12, 20], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    ss = wb.create_sheet("会话明细")
    ss.append(["会话 ID", "线程名", "开始时间", "结束时间", "用户指令数",
               "回合数", "工具调用数", "输入令牌", "输出令牌", "工作目录"])
    style_header(ss)
    for s in sorted(sessions, key=lambda x: x.get("started") or ""):
        ss.append([s["id"][:8], s["thread_name"] or s["prompts"][0]["text"][:30] if s["prompts"] else "",
                   str(s["started"]).replace("T", " ")[:19], str(s["ended"]).replace("T", " ")[:19],
                   len(s["prompts"]), s["turns"], len(s["calls"]),
                   s["tokens"]["input"], s["tokens"]["output"], s["cwd"]])
    for i, w in enumerate([10, 30, 20, 20, 10, 8, 10, 12, 10, 34], 1):
        ss.column_dimensions[get_column_letter(i)].width = w
    ss.freeze_panes = "A2"
    ss.auto_filter.ref = ss.dimensions

    ov = wb.create_sheet("概览")
    ov.append(["指标", "数值"])
    style_header(ov)
    for k, v in [("会话数", totals["sessions"]), ("回合数", totals["turns"]),
                 ("工具调用总数", totals["calls"]), ("输入令牌", totals["input"]),
                 ("输出令牌", totals["output"]), ("缓存命中", totals["cached"]),
                 ("推理令牌", totals["reasoning"]), ("生成时间",
                   datetime.now().strftime("%Y-%m-%d %H:%M:%S"))]:
        ov.append([k, v])
    ov.column_dimensions["A"].width = 16
    ov.column_dimensions["B"].width = 26
    wb.save(out_path)


def export_csv(sessions, detail, out_path):
    import csv
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["大类", "归属", "工具", "调用次数", "涉及会话数", "最近调用"])
        for (cat, label, name), count, sess, last in detail:
            w.writerow([cat, label, name, count, sess, str(last).replace("T", " ")[:19]])
        w.writerow([])
        w.writerow(["会话 ID", "线程名", "开始", "指令数", "回合数", "调用数", "输入令牌", "输出令牌"])
        for s in sorted(sessions, key=lambda x: x.get("started") or ""):
            w.writerow([s["id"][:8], s["thread_name"], s["started"], len(s["prompts"]),
                        s["turns"], len(s["calls"]), s["tokens"]["input"], s["tokens"]["output"]])


# ---------------------------------------------------------------- flow

def session_events(s):
    """把会话摘要转成有序事件列表（dict）。"""
    events = []
    marks = {(p["ts"], p["text"]) for p in s["prompts"]}
    # calls 与 prompts 按时间戳归并：rollout 是追加式，直接用解析顺序即可
    seq = ([("prompt", p["ts"], p["text"]) for p in s["prompts"]] +
           [("call", c["ts"], c) for c in s["calls"]])
    # parse_session 已按文件顺序解析，prompts/calls 分开存了；用时间戳稳定归并
    seq.sort(key=lambda x: (x[1] or ""))
    for kind, ts, obj in seq:
        if kind == "prompt":
            events.append({"type": "prompt", "ts": ts, "label": obj[:80]})
        else:
            c = obj
            disp = c["name"]
            if c["kind"] == "mcp":
                disp = f"mcp:{c['namespace'][5:]}::{c['name']}"
            events.append({"type": "tool", "ts": ts, "name": disp,
                           "ns": c["namespace"], "kind": c["kind"], "hint": c["hint"]})
    return events


def build_mermaid(events, title=""):
    """把事件流自动聚合成 Mermaid flowchart TD（连续同类调用合并为阶段节点）。"""
    stages = []  # [label, count, hint]
    prompts = []
    for ev in events:
        if ev["type"] == "prompt":
            prompts.append(ev["label"])
        else:
            key = ev["name"]
            if stages and stages[-1][0] == key:
                stages[-1][1] += 1
                stages[-1][2] = stages[-1][2] or ev.get("hint", "")
            else:
                stages.append([key, 1, ev.get("hint", "")])

    def clean(t, n=26):
        t = re.sub(r"[\s`\"'{}\[\]|<>]", " ", str(t)).strip()
        return (t[:n] + "…") if len(t) > n else (t or "…")

    lines = ["flowchart TD"]
    idx = 0
    node_of_stage = []
    for label, count, hint in stages[:24]:
        idx += 1
        nid = f"S{idx}"
        txt = f"{clean(label, 24)}" + (f" ×{count}" if count > 1 else "")
        if hint:
            txt += f"\\n{clean(hint, 30)}"
        lines.append(f'    {nid}["{txt}"]')
        node_of_stage.append(nid)
    if prompts:
        lines.insert(1, f'    P0(["需求：{clean(prompts[0], 30)}"])')
        prev = "P0"
        for i, nid in enumerate(node_of_stage):
            lines.append(f"    {prev} --> {nid}")
            prev = nid
        lines.append('    END(["产出"])')
        if node_of_stage:
            lines.append(f"    {prev} --> END")
        else:
            lines.append("    P0 --> END")
    else:
        if node_of_stage:
            lines.insert(1, f'    P0(["会话开始"])')
            lines.append("    P0 --> " + node_of_stage[0])
            for a, b in zip(node_of_stage, node_of_stage[1:]):
                lines.append(f"    {a} --> {b}")
    return "\n".join(lines)


def pick_session(sessions, which):
    if not sessions:
        return None
    if which in (None, "", "recent"):
        return max(sessions, key=lambda s: os.path.getmtime(s["file"]))
    frag = which.lower()
    for s in sessions:
        if frag in s["id"].lower() or frag in os.path.basename(s["file"]).lower():
            return s
    for s in sessions:
        if frag in (s["thread_name"] or "").lower():
            return s
    return None


# ---------------------------------------------------------------- cli

def cmd_usage(args):
    sessions = load_all(args.sessions_dir, args.days)
    if not sessions:
        print("EMPTY：未找到会话记录（检查 ~/.codex/sessions 或 --sessions-dir）")
        return 0
    detail, kind_totals, totals = aggregate_usage(sessions)
    scope = f"最近 {args.days} 天" if args.days else "全部记录"
    md = render_usage_markdown(sessions, detail, kind_totals, totals, scope)
    print(md)
    if args.xlsx:
        try:
            export_xlsx(sessions, detail, totals, args.xlsx)
            print(f"\nXLSX: {os.path.abspath(args.xlsx)}")
        except ImportError:
            print("\nopenpyxl 未安装，已跳过 Excel 导出（pip install openpyxl 后重试）", file=sys.stderr)
    if args.csv:
        export_csv(sessions, detail, args.csv)
        print(f"CSV: {os.path.abspath(args.csv)}")
    return 0


def cmd_flow(args):
    sessions = load_all(args.sessions_dir, None)
    s = pick_session(sessions, args.session)
    if s is None:
        print(f"NOT_FOUND：找不到匹配 '{args.session}' 的会话")
        return 1
    events = session_events(s)
    if args.json:
        print(json.dumps({"session": s["id"], "thread_name": s["thread_name"],
                          "events": events}, ensure_ascii=False))
        return 0
    mermaid = build_mermaid(events)
    title = s["thread_name"] or (s["prompts"][0]["text"][:40] if s["prompts"] else s["id"][:8])
    doc = (f"# Codex 会话流程图：{title}\n\n"
           f"- 会话 ID：`{s['id']}`\n- 时间：{str(s['started']).replace('T', ' ')[:19]} ~ "
           f"{str(s['ended']).replace('T', ' ')[:19]}\n"
           f"- 规模：{len(s['prompts'])} 条用户指令，{s['turns']} 个回合，{len(s['calls'])} 次工具调用，"
           f"输入令牌 {s['tokens']['input']:,} / 输出 {s['tokens']['output']:,}\n\n"
           f"```mermaid\n{mermaid}\n```\n")
    out = args.out
    if not out:
        stamp = (s["started"] or datetime.utcnow().isoformat()).replace("-", "")[:8]
        out = f"codex-flow-{s['id'][:8]}-{stamp}.md"
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    print(doc)
    print(f"SAVED: {os.path.abspath(out)}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="codex_manager", description=__doc__.split("\n")[1])
    sub = ap.add_subparsers(dest="cmd", required=True)

    u = sub.add_parser("usage", help="聚合 MCP/工具用量并导出报表")
    u.add_argument("--days", type=int, default=None, help="只统计最近 N 天")
    u.add_argument("--xlsx", default=None, help="导出 Excel 路径")
    u.add_argument("--csv", default=None, help="导出 CSV 路径")
    u.add_argument("--sessions-dir", default=None, help="覆盖会话目录（默认 ~/.codex/sessions）")

    fl = sub.add_parser("flow", help="把一次会话转成 Mermaid 流程图")
    fl.add_argument("--session", default="recent", help="recent / 会话ID片段 / 文件名片段")
    fl.add_argument("--out", default=None, help="输出 .md 路径")
    fl.add_argument("--json", action="store_true", help="输出 JSON 事件流而不是直接画图")
    fl.add_argument("--sessions-dir", default=None)

    a = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if a.cmd == "usage":
        return cmd_usage(a)
    return cmd_flow(a)


if __name__ == "__main__":
    sys.exit(main())
