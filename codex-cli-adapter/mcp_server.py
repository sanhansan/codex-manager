#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Codex Manager MCP 服务器（stdio，零第三方依赖）。

在 ~/.codex/config.toml 注册后，Codex 内可调用：
  codex_usage(days?)      —— 用量报表（Markdown）
  codex_flow(session?)    —— 会话事件流 + Mermaid 流程图
  codex_sessions(limit?)  —— 最近会话清单

MCP stdio 传输：按行分隔的 JSON-RPC 2.0。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import codex_manager as cm  # noqa: E402

SERVER_INFO = {"name": "codex-manager", "version": "0.1.0"}

TOOLS = [
    {
        "name": "codex_usage",
        "description": "统计 OpenAI Codex 的会话与工具用量：MCP 服务器/内置工具调用次数、会话数、令牌消耗，返回 Markdown 表格。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "只统计最近 N 天，缺省为全部"}
            },
        },
    },
    {
        "name": "codex_flow",
        "description": "把一次 Codex 会话转化为 Mermaid 流程图与事件流。session 可传 recent、会话 ID 片段或线程名片段。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session": {"type": "string", "description": "recent / 会话ID片段 / 线程名片段，缺省 recent"}
            },
        },
    },
    {
        "name": "codex_sessions",
        "description": "列出最近的 Codex 会话（ID、线程名、时间、规模），用于选择要复盘的会话。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "返回条数，默认 10"}
            },
        },
    },
]


def tool_codex_usage(args):
    days = args.get("days")
    sessions = cm.load_all(None, int(days) if days else None)
    if not sessions:
        return "EMPTY：未找到会话记录。"
    detail, kind_totals, totals = cm.aggregate_usage(sessions)
    scope = f"最近 {days} 天" if days else "全部记录"
    return cm.render_usage_markdown(sessions, detail, kind_totals, totals, scope)


def tool_codex_flow(args):
    which = args.get("session") or "recent"
    sessions = cm.load_all(None, None)
    s = cm.pick_session(sessions, which)
    if s is None:
        return f"NOT_FOUND：找不到匹配 '{which}' 的会话。可先用 codex_sessions 列出会话。"
    events = cm.session_events(s)
    mermaid = cm.build_mermaid(events)
    head = (f"会话：{s['thread_name'] or s['id'][:8]} | "
            f"{len(s['prompts'])} 条指令 / {s['turns']} 回合 / {len(s['calls'])} 次调用\n\n")
    return head + "```mermaid\n" + mermaid + "\n```\n\n事件流（JSON）：\n" + \
        json.dumps(events, ensure_ascii=False)


def tool_codex_sessions(args):
    limit = int(args.get("limit") or 10)
    sessions = cm.load_all(None, None)
    sessions.sort(key=lambda s: s.get("ended") or "", reverse=True)
    rows = ["| 会话 | 线程名 | 时间 | 指令/回合/调用 |", "| --- | --- | --- | --- |"]
    for s in sessions[:limit]:
        name = s["thread_name"] or (s["prompts"][0]["text"][:28] if s["prompts"] else "")
        rows.append(f"| {s['id'][:8]} | {name} | {str(s['started']).replace('T',' ')[:16]} | "
                    f"{len(s['prompts'])}/{s['turns']}/{len(s['calls'])} |")
    return "\n".join(rows)


DISPATCH = {"codex_usage": tool_codex_usage,
            "codex_flow": tool_codex_flow,
            "codex_sessions": tool_codex_sessions}


def reply(rid, result):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": rid, "result": result},
                                ensure_ascii=False) + "\n")
    sys.stdout.flush()


def reply_error(rid, code, message):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": rid,
                                 "error": {"code": code, "message": message}}) + "\n")
    sys.stdout.flush()


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    except Exception:
        pass
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue
        method = req.get("method", "")
        rid = req.get("id")
        if method == "initialize":
            reply(rid, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": SERVER_INFO,
            })
        elif method == "tools/list":
            reply(rid, {"tools": TOOLS})
        elif method == "tools/call":
            name = (req.get("params") or {}).get("name", "")
            args = (req.get("params") or {}).get("arguments") or {}
            fn = DISPATCH.get(name)
            if fn is None:
                reply_error(rid, -32602, f"unknown tool: {name}")
                continue
            try:
                text = fn(args)
                reply(rid, {"content": [{"type": "text", "text": text}], "isError": False})
            except Exception as e:
                reply(rid, {"content": [{"type": "text", "text": f"error: {e}"}],
                            "isError": True})
        elif method == "ping":
            reply(rid, {})
        elif method.startswith("notifications/"):
            pass
        elif rid is not None:
            reply_error(rid, -32601, f"method not found: {method}")


if __name__ == "__main__":
    main()
