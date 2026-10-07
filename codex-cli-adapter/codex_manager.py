#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Codex Manager — OpenAI Codex CLI 适配核心。

功能：
  usage  扫描 ~/.codex/sessions 的 rollout 会话记录，聚合 MCP 服务器 / 工具 / 已安装插件
         的使用量与任务消耗（每任务令牌），并导出报表（Markdown / Excel / CSV）。
  flow   提取一次会话的事件流（用户指令 + 工具调用），生成 Mermaid 流程图或 JSON 事件。

适配 codex-cli 0.157.x 的 rollout 记录格式：
  response_item/message(role=user|assistant|developer)
  response_item/function_call(name, namespace="mcp__server"|其他, arguments=JSON字符串)
  response_item/custom_tool_call(name, input)
  token_usage_record —— usage=单次模型调用；turn_token_usage=任务内累计（按 turn_id 差分）；
                        thread_token_usage=线程累计（会话级取最后一条）；event_msg:token_count 为旧格式回退
  session_meta / event_msg:task_started|task_complete / compacted —— 任务边界与压缩标记
  ~/.codex/config.toml 的 [plugins."名称@市场"] 清单 + 插件缓存 .mcp.json（MCP 服务器→插件归属）

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
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".codex", "config.toml")
PLUGINS_CACHE_DIR = os.path.join(os.path.expanduser("~"), ".codex", "plugins", "cache")

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


def load_installed_plugins(config_path=None):
    """从 config.toml 的 [plugins."名称@市场"] 段读取已安装插件（enabled=false 的跳过）。"""
    path = config_path or CONFIG_FILE
    plugins, cur = [], None
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError:
        return plugins
    for ln in lines:
        s = ln.split("#", 1)[0].strip()  # 容忍行内注释："[plugins.x]" # 说明
        m = re.match(r'^\[plugins\."([^"@]+)(?:@([^"]+))?"\]$', s)
        if m:
            cur = {"name": m.group(1), "market": m.group(2) or "", "enabled": True}
            plugins.append(cur)
            continue
        if s.startswith("["):
            cur = None
            continue
        if cur is not None and re.match(r'^enabled\s*=\s*false\b', s):
            cur["enabled"] = False
    return [p for p in plugins if p["enabled"]]


def scan_plugin_mcp_servers(cache_root=None):
    """扫插件缓存，建立 MCP 服务器名 → 提供它的插件 的归属表。

    返回 (server_owner, plugin_servers)：
      server_owner    {MCP 服务器名: 插件名}
      plugin_servers  {插件名: [MCP 服务器名, ...]}
    """
    root = cache_root or PLUGINS_CACHE_DIR
    server_owner, plugin_servers = {}, {}

    def add(plugin, names):
        for sname in names:
            if not sname:
                continue
            server_owner.setdefault(sname, plugin)
            lst = plugin_servers.setdefault(plugin, [])
            if sname not in lst:
                lst.append(sname)

    if not os.path.isdir(root):
        return server_owner, plugin_servers
    for manifest in sorted(glob.glob(os.path.join(root, "*", "*", "*", ".mcp.json"))):
        plugin = os.path.basename(os.path.dirname(os.path.dirname(manifest)))
        try:
            with open(manifest, encoding="utf-8") as f:
                data = json.load(f)
            add(plugin, list((data.get("mcpServers") or {}).keys()))
        except Exception:
            continue
    for manifest in sorted(glob.glob(os.path.join(root, "*", "*", "*", ".codex-plugin", "plugin.json"))):
        version_dir = os.path.dirname(os.path.dirname(manifest))
        plugin = os.path.basename(os.path.dirname(version_dir))
        try:
            with open(manifest, encoding="utf-8") as f:
                pj = json.load(f)
        except Exception:
            continue
        ms = pj.get("mcpServers")
        if isinstance(ms, dict):
            add(plugin, list(ms.keys()))
        elif isinstance(ms, str):
            for base in (version_dir, os.path.dirname(version_dir)):
                fp = os.path.join(base, ms.lstrip("./\\"))
                if os.path.isfile(fp):
                    try:
                        with open(fp, encoding="utf-8") as f:
                            add(plugin, list((json.load(f).get("mcpServers") or {}).keys()))
                    except Exception:
                        pass
                    break
    return server_owner, plugin_servers


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


def _token_nums(u):
    return {
        "input": int(u.get("input_tokens") or 0),
        "cached": int(u.get("cached_input_tokens") or 0),
        "write": int(u.get("cache_write_input_tokens") or 0),
        "output": int(u.get("output_tokens") or 0),
        "reasoning": int(u.get("reasoning_output_tokens") or 0),
        "total": int(u.get("total_tokens") or 0),
    }


def _new_task(ts):
    return {
        "started": ts, "ended": None, "prompt": "",
        "model_calls": 0, "calls": 0,
        "tokens": {"input": 0, "cached": 0, "write": 0, "output": 0, "reasoning": 0, "total": 0},
    }


def _close_open_task(sess, ts):
    if sess["tasks"] and sess["tasks"][-1]["ended"] is None:
        sess["tasks"][-1]["ended"] = ts


def _accumulate_task_tokens(sess, ts, p):
    """turn_token_usage 是任务内累计值：按 turn_id 求差分，累加到当前任务。"""
    tt = p.get("turn_token_usage") or {}
    if tt.get("input_tokens") is None:
        return
    if not sess["tasks"]:
        sess["tasks"].append(_new_task(ts))
    cur = sess["tasks"][-1]
    cur["model_calls"] += 1
    tid = str(p.get("turn_id") or "")
    prev = sess["_turn_seen"].get(tid) or {}
    for key, skey in (("input_tokens", "input"), ("cached_input_tokens", "cached"),
                      ("cache_write_input_tokens", "write"), ("output_tokens", "output"),
                      ("reasoning_output_tokens", "reasoning"), ("total_tokens", "total")):
        v = int(tt.get(key) or 0)
        pv = int(prev.get(key) or 0)
        cur["tokens"][skey] += (v - pv) if v >= pv else v
    sess["_turn_seen"][tid] = tt


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
        "tokens": {"input": 0, "output": 0, "cached": 0, "write": 0, "reasoning": 0, "total": 0},
        "turns": 0,
        "compactions": 0,
        "last_agent_message": "",
        "tasks": [],              # [{started, ended, prompt, model_calls, calls, tokens}]
        "_turn_seen": {},
        "_has_token_rec": False,
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
                _close_open_task(sess, ts)
                sess["tasks"].append(_new_task(ts))
            elif t == "event_msg" and p.get("type") == "task_complete":
                _close_open_task(sess, ts)
                msg = p.get("last_agent_message")
                if isinstance(msg, str) and msg.strip():
                    sess["last_agent_message"] = msg.strip()[:120]
            elif t == "compacted":
                sess["compactions"] += 1
            elif t == "token_usage_record":
                sess["_has_token_rec"] = True
                u = p.get("thread_token_usage") or p.get("total_token_usage") or {}
                if u.get("input_tokens") is not None:
                    sess["tokens"] = _token_nums(u)
                _accumulate_task_tokens(sess, ts, p)
            elif t == "event_msg" and p.get("type") == "token_count":
                u = (p.get("info") or {}).get("total_token_usage") or {}
                if u.get("input_tokens") is not None and not sess["_has_token_rec"]:
                    sess["tokens"] = _token_nums(u)
            elif t == "response_item":
                pt = p.get("type")
                if pt == "message" and p.get("role") == "user":
                    for b in p.get("content") or []:
                        if isinstance(b, dict) and b.get("type") in ("input_text", "text"):
                            txt = str(b.get("text") or "").strip()
                            if txt and not txt.startswith(SKIP_PROMPT_PREFIXES):
                                sess["prompts"].append({"ts": ts, "text": txt[:120]})
                                if sess["tasks"] and not sess["tasks"][-1]["prompt"]:
                                    sess["tasks"][-1]["prompt"] = " ".join(txt.split())[:80]
                elif pt == "function_call":
                    name = str(p.get("name") or "?")
                    ns = str(p.get("namespace") or "")
                    args = _safe_json(p.get("arguments") or "")
                    sess["calls"].append({
                        "ts": ts, "kind": "mcp" if ns.startswith("mcp__") else "builtin",
                        "namespace": ns, "name": name, "hint": _text_hint(args),
                    })
                    if sess["tasks"]:
                        sess["tasks"][-1]["calls"] += 1
                elif pt == "custom_tool_call":
                    sess["calls"].append({
                        "ts": ts, "kind": "custom", "namespace": "",
                        "name": str(p.get("name") or "?"),
                        "hint": _text_hint(p.get("input")),
                    })
                    if sess["tasks"]:
                        sess["tasks"][-1]["calls"] += 1
    sess.pop("_turn_seen", None)
    sess.pop("_has_token_rec", None)
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

def aggregate_usage(sessions, server_owner=None):
    """按 (大类, 归属, 名称) 聚合调用，并把 MCP 调用归属到插件。

    返回 (detail, kind_totals, totals, plugin_usage)：
      detail        [{cat, owner, plugin, name, count, sessions, last}]，按调用次数降序
      kind_totals   {mcp / builtin / custom: 次数}
      totals        会话 / 任务 / 调用 / 令牌（会话累计 + 任务合计）汇总
      plugin_usage  {插件名: {count, sessions, last}}
    """
    owner_map = server_owner or {}
    agg = {}
    kind_totals = defaultdict(int)
    plugin_agg = {}
    totals = {"sessions": len(sessions), "turns": 0, "calls": 0, "tasks": 0, "tasks_used": 0,
              "input": 0, "output": 0, "cached": 0, "write": 0, "reasoning": 0, "total": 0,
              "task_input": 0, "task_output": 0, "task_total": 0}
    for s in sessions:
        totals["turns"] += s["turns"]
        for k in ("input", "output", "cached", "write", "reasoning", "total"):
            totals[k] += s["tokens"].get(k, 0)
        for t in s.get("tasks") or []:
            totals["tasks"] += 1
            if t["model_calls"]:
                totals["tasks_used"] += 1
            totals["task_input"] += t["tokens"]["input"]
            totals["task_output"] += t["tokens"]["output"]
            totals["task_total"] += t["tokens"]["total"]
        for c in s["calls"]:
            totals["calls"] += 1
            kind_totals[c["kind"]] += 1
            plugin = ""
            if c["kind"] == "mcp":
                server = c["namespace"][5:] or "(unknown)"
                cat, label = "MCP 服务器", server
                name = c["name"]
                plugin = owner_map.get(server, "")
                if plugin:
                    pa = plugin_agg.setdefault(plugin, {"count": 0, "sessions": set(), "last": ""})
                    pa["count"] += 1
                    if s["id"]:
                        pa["sessions"].add(s["id"])
                    if (c["ts"] or "") > pa["last"]:
                        pa["last"] = c["ts"] or ""
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
    detail = [{"cat": cat, "owner": label, "plugin": owner_map.get(label, "") if cat == "MCP 服务器" else "",
               "name": name, "count": a["count"], "sessions": len(a["sessions"]), "last": a["last"]}
              for (cat, label, name), a in agg.items()]
    detail.sort(key=lambda r: (-r["count"], r["name"]))
    plugin_usage = {k: {"count": v["count"], "sessions": len(v["sessions"]), "last": v["last"]}
                    for k, v in plugin_agg.items()}
    return detail, dict(kind_totals), totals, plugin_usage


def merge_plugin_report(installed, plugin_usage, plugin_servers):
    """合并安装清单与用量：已安装但没用过的插件也列出（调用次数 0）。"""
    usage = plugin_usage or {}
    servers = plugin_servers or {}
    rows, seen = [], set()
    for p in installed or []:
        name = p["name"]
        seen.add(name)
        u = usage.get(name) or {"count": 0, "sessions": 0, "last": ""}
        rows.append({"name": name, "market": p.get("market", ""), "servers": servers.get(name, []),
                     "count": u["count"], "sessions": u["sessions"], "last": u["last"], "installed": True})
    for name, u in usage.items():
        if name in seen:
            continue
        rows.append({"name": name, "market": "", "servers": servers.get(name, []),
                     "count": u["count"], "sessions": u["sessions"], "last": u["last"], "installed": False})
    rows.sort(key=lambda r: (-r["count"], r["name"]))
    return rows


def analyze_usage(sessions_dir=None, days=None, config_path=None, cache_root=None):
    """加载会话 → 归属插件 → 聚合，返回报表数据 bundle（无会话返回 None）。"""
    sessions = load_all(sessions_dir, days)
    if not sessions:
        return None
    installed = load_installed_plugins(config_path)
    server_owner, plugin_servers = scan_plugin_mcp_servers(cache_root)
    detail, kind_totals, totals, plugin_usage = aggregate_usage(sessions, server_owner)
    plugins = merge_plugin_report(installed, plugin_usage, plugin_servers)
    return {"sessions": sessions, "detail": detail, "kind_totals": kind_totals, "totals": totals,
            "plugins": plugins, "installed_count": len(installed),
            "scope": f"最近 {days} 天" if days else "全部记录"}


def render_usage_markdown(sessions, detail, kind_totals, totals, scope, plugins=None):
    lines = [f"统计范围：{scope}；会话 {totals['sessions']} 个，任务 {totals['tasks']} 个"
             f"（其中 {totals['tasks_used']} 个含模型调用），工具调用 {totals['calls']} 次"
             f"（MCP {kind_totals.get('mcp', 0)} / 内置 {kind_totals.get('builtin', 0)} / "
             f"自定义 {kind_totals.get('custom', 0)}）。",
             f"令牌消耗（会话累计）：输入 {totals['input']:,}（含缓存命中 {totals['cached']:,}），"
             f"输出 {totals['output']:,}，推理 {totals['reasoning']:,}。"]
    if totals["tasks_used"]:
        avg = totals["task_total"] // max(totals["tasks_used"], 1)
        lines.append(f"任务消耗：合计总令牌 {totals['task_total']:,}（输入 {totals['task_input']:,} / "
                     f"输出 {totals['task_output']:,}），含模型调用的任务平均 {avg:,} 令牌/个。")
    if any(s.get("compactions") for s in sessions):
        lines.append("注：部分会话经历过上下文压缩（compaction），令牌为该会话最后一次上下文窗口的累计值。")
    if plugins is not None:
        lines += ["", f"### 插件使用量（config.toml 已安装 {sum(1 for p in plugins if p['installed'])} 个）", "",
                  "| 插件 | 市场 | 提供的 MCP 服务器 | 调用次数 | 会话数 | 最近调用 |",
                  "| --- | --- | --- | ---: | ---: | --- |"]
        for p in plugins:
            lines.append(f"| {p['name']} | {p['market'] or '-'} | {', '.join(p['servers']) or '-'} | "
                         f"{p['count']} | {p['sessions']} | {str(p['last']).replace('T', ' ')[:19] or '-'} |")
    lines += ["", "### 工具调用", "",
              "| 大类 | 归属 | 插件 | 工具 | 调用次数 | 会话数 | 最近调用 |",
              "| --- | --- | --- | --- | ---: | ---: | --- |"]
    for r in detail:
        lines.append(f"| {r['cat']} | {r['owner']} | {r['plugin'] or '-'} | {r['name']} | "
                     f"{r['count']} | {r['sessions']} | {str(r['last']).replace('T', ' ')[:19]} |")
    tasks = [(s, i, t) for s in sessions for i, t in enumerate(s.get("tasks") or [], 1)]
    tasks.sort(key=lambda x: -x[2]["tokens"]["total"])
    if tasks:
        lines += ["", "### 任务消耗 Top 10（按总令牌）", "",
                  "| 会话 | 任务 | 开始时间 | 指令 | 模型/工具调用 | 输入 | 输出 | 总令牌 |",
                  "| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |"]
        for s, i, t in tasks[:10]:
            name = (s["thread_name"] or s["id"][:8] or "-").replace("|", "/")
            prompt = (t["prompt"] or "-").replace("|", "/")
            lines.append(f"| {name[:18]} | {i} | {str(t['started']).replace('T', ' ')[:19]} | {prompt} | "
                         f"{t['model_calls']}/{t['calls']} | {t['tokens']['input']:,} | "
                         f"{t['tokens']['output']:,} | {t['tokens']['total']:,} |")
    return "\n".join(lines)


def export_xlsx(sessions, detail, totals, out_path, plugins=None):
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
    ws.append(["大类", "归属", "插件", "工具", "调用次数", "涉及会话数", "最近调用"])
    style_header(ws)
    for r in detail:
        ws.append([r["cat"], r["owner"], r["plugin"], r["name"], r["count"], r["sessions"],
                   str(r["last"]).replace("T", " ")[:19]])
    for i, w in enumerate([14, 22, 16, 24, 10, 12, 20], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    if plugins is not None:
        ps = wb.create_sheet("插件")
        ps.append(["插件", "市场", "提供的 MCP 服务器", "调用次数", "涉及会话数", "最近调用", "已安装"])
        style_header(ps)
        for p in plugins:
            ps.append([p["name"], p["market"], ", ".join(p["servers"]), p["count"], p["sessions"],
                       str(p["last"]).replace("T", " ")[:19], "是" if p["installed"] else "否"])
        for i, w in enumerate([20, 14, 30, 10, 12, 20, 8], 1):
            ps.column_dimensions[get_column_letter(i)].width = w
        ps.freeze_panes = "A2"
        ps.auto_filter.ref = ps.dimensions

    ts = wb.create_sheet("任务明细")
    ts.append(["会话 ID", "任务", "开始时间", "结束时间", "指令", "模型调用", "工具调用",
               "输入令牌", "缓存命中", "输出令牌", "推理令牌", "总令牌"])
    style_header(ts)
    for s in sorted(sessions, key=lambda x: x.get("started") or ""):
        for i, t in enumerate(s.get("tasks") or [], 1):
            ts.append([s["id"][:8], i, str(t["started"]).replace("T", " ")[:19],
                       str(t["ended"]).replace("T", " ")[:19], t["prompt"],
                       t["model_calls"], t["calls"], t["tokens"]["input"], t["tokens"]["cached"],
                       t["tokens"]["output"], t["tokens"]["reasoning"], t["tokens"]["total"]])
    for i, w in enumerate([10, 6, 20, 20, 40, 10, 10, 12, 12, 12, 12, 12], 1):
        ts.column_dimensions[get_column_letter(i)].width = w
    ts.freeze_panes = "A2"
    ts.auto_filter.ref = ts.dimensions

    ss = wb.create_sheet("会话明细")
    ss.append(["会话 ID", "线程名", "开始时间", "结束时间", "用户指令数",
               "任务数", "工具调用数", "输入令牌", "输出令牌", "总令牌", "工作目录"])
    style_header(ss)
    for s in sorted(sessions, key=lambda x: x.get("started") or ""):
        ss.append([s["id"][:8], s["thread_name"] or s["prompts"][0]["text"][:30] if s["prompts"] else "",
                   str(s["started"]).replace("T", " ")[:19], str(s["ended"]).replace("T", " ")[:19],
                   len(s["prompts"]), len(s.get("tasks") or []), len(s["calls"]),
                   s["tokens"]["input"], s["tokens"]["output"], s["tokens"]["total"], s["cwd"]])
    for i, w in enumerate([10, 30, 20, 20, 10, 8, 10, 12, 10, 12, 34], 1):
        ss.column_dimensions[get_column_letter(i)].width = w
    ss.freeze_panes = "A2"
    ss.auto_filter.ref = ss.dimensions

    ov = wb.create_sheet("概览")
    ov.append(["指标", "数值"])
    style_header(ov)
    avg = totals["task_total"] // max(totals["tasks_used"], 1)
    for k, v in [("会话数", totals["sessions"]), ("任务数", totals["tasks"]),
                 ("含模型调用的任务数", totals["tasks_used"]), ("任务平均总令牌", avg),
                 ("工具调用总数", totals["calls"]), ("输入令牌（会话累计）", totals["input"]),
                 ("输出令牌（会话累计）", totals["output"]), ("任务合计总令牌", totals["task_total"]),
                 ("缓存命中", totals["cached"]), ("推理令牌", totals["reasoning"]),
                 ("生成时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))]:
        ov.append([k, v])
    ov.column_dimensions["A"].width = 22
    ov.column_dimensions["B"].width = 26
    wb.save(out_path)


def export_csv(sessions, detail, out_path, plugins=None):
    import csv
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if plugins is not None:
            w.writerow(["插件", "市场", "提供的 MCP 服务器", "调用次数", "涉及会话数", "最近调用"])
            for p in plugins:
                w.writerow([p["name"], p["market"], ", ".join(p["servers"]), p["count"],
                            p["sessions"], str(p["last"]).replace("T", " ")[:19]])
            w.writerow([])
        w.writerow(["大类", "归属", "插件", "工具", "调用次数", "涉及会话数", "最近调用"])
        for r in detail:
            w.writerow([r["cat"], r["owner"], r["plugin"], r["name"], r["count"], r["sessions"],
                        str(r["last"]).replace("T", " ")[:19]])
        w.writerow([])
        w.writerow(["会话 ID", "任务", "开始", "结束", "指令", "模型调用", "工具调用",
                    "输入令牌", "输出令牌", "总令牌"])
        for s in sorted(sessions, key=lambda x: x.get("started") or ""):
            for i, t in enumerate(s.get("tasks") or [], 1):
                w.writerow([s["id"][:8], i, t["started"], t["ended"], t["prompt"],
                            t["model_calls"], t["calls"], t["tokens"]["input"],
                            t["tokens"]["output"], t["tokens"]["total"]])
        w.writerow([])
        w.writerow(["会话 ID", "线程名", "开始", "指令数", "任务数", "调用数",
                    "输入令牌", "输出令牌", "总令牌"])
        for s in sorted(sessions, key=lambda x: x.get("started") or ""):
            w.writerow([s["id"][:8], s["thread_name"], s["started"], len(s["prompts"]),
                        len(s.get("tasks") or []), len(s["calls"]), s["tokens"]["input"],
                        s["tokens"]["output"], s["tokens"]["total"]])


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
        def _mtime(s):
            try:
                return os.path.getmtime(s["file"])
            except OSError:
                return 0  # 文件在发现后消失：排到最后，不让报表直接崩溃
        return max(sessions, key=_mtime)
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
    bundle = analyze_usage(args.sessions_dir, args.days)
    if bundle is None:
        print("EMPTY：未找到会话记录（检查 ~/.codex/sessions 或 --sessions-dir）")
        return 0
    md = render_usage_markdown(bundle["sessions"], bundle["detail"], bundle["kind_totals"],
                               bundle["totals"], bundle["scope"], bundle["plugins"])
    print(md)
    if args.xlsx:
        try:
            export_xlsx(bundle["sessions"], bundle["detail"], bundle["totals"], args.xlsx,
                        bundle["plugins"])
            print(f"\nXLSX: {os.path.abspath(args.xlsx)}")
        except ImportError:
            print("\nopenpyxl 未安装，已跳过 Excel 导出（pip install openpyxl 后重试）", file=sys.stderr)
    if args.csv:
        export_csv(bundle["sessions"], bundle["detail"], args.csv, bundle["plugins"])
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

    u = sub.add_parser("usage", help="聚合 MCP/工具/插件用量与任务消耗并导出报表")
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
