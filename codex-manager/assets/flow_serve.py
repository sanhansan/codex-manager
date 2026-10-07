#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""flow_serve.py — codex-flow-edit 的本地托管服务（纯标准库，零依赖）

用法:
  python flow_serve.py --dir <工作目录> [--watch flow-source.mmd] [--port 8380] [--open]

功能:
  1. 静态托管 <目录> 下的文件（含 flow-editor.html）；
  2. GET  /__flow_ping  → {"ok":true,"watch":"flow-source.mmd",...}（编辑器用它探测写回能力）
  3. GET  /<watch 文件> → 编辑器每 1.5s 轮询，文件一变画布自动重画；
  4. POST /__flow_write {"text": "..."} → 原子写回 watch 文件（临时文件 + os.replace），
     编辑器画布改动自动落到文件，不需要任何浏览器授权；
  5. GET  /__flow_skills → 列技能草稿目录与插件安装目录下的 <slug>/SKILL.md；
  6. GET  /__flow_skill?slug=&src=draft|install → 读单个技能文件原文；
  7. POST /__flow_skill {"slug","text","target":"draft"|"install"} → 原子写草稿或安装到插件；
  8. GET  /__flow_rollout → 列 rollout 目录的 model-io-sess_*.jsonl（名称/会话/大小/mtime）；
  9. GET  /__flow_rollout_file?name=... → 读单个会话文件原文（编辑器问答视图自动载入/同步）；
 10. GET  /__flow_agents → 列 agents 目录下 sess_*/agent_*/ 的子智能体（元信息+输出大小）；
 11. GET  /__flow_agent?path=sess_x/agent_y → 读该子智能体的 metadata.json 与 output.txt 原文；
 12. GET  /__flow_clients → 列三个代码客户端（ZCode / Codex CLI / Qoder CLI）的会话文件（含 Qoder 子智能体）；
 13. GET  /__flow_client_file?client=&id=&tail= → 读指定客户端会话原文（tail=末尾字节数，大文件增量浏览）；
 14. GET  /__flow_client_usage → 多客户端用量聚合（ZCode+Codex 令牌明细、Qoder 模型调用数，20s 缓存）；
 15. GET  /__flow_settings → 数据来源目录设置视图（saved/cli/default/effective/exists）；
 16. POST /__flow_settings {"paths":{...}} → 保存数据来源目录（usage/rollout/agents/codex/qoder），
     写入 ~/.zcode/codex-manager/flow-settings.json 并立即生效（空串=清除覆盖；
     启动参数指定的路径优先，不受设置覆盖）。

安全约束：只绑定 127.0.0.1；写回目标固定为 --watch 指定的单个文件、技能目录下的
SKILL.md 或设置文件 flow-settings.json，slug 必须匹配 ^[a-z0-9][a-z0-9-]{0,63}$，
会话/子智能体/客户端文件路径按名字正则校验且解析后的真实路径必须位于对应根目录之内
（防目录穿越）；设置键固定为 5 个数据来源目录且值必须为绝对路径字符串；会话文件与
客户端文件读取均有字节上限。
"""
import argparse
import glob
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
ROLLOUT_FILE_RE = re.compile(r"^model-io-sess_[A-Za-z0-9._-]+\.jsonl$")
DIRNAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,96}$")
ROLLOUT_MAX_BYTES = 64 * 1024 * 1024  # 单个会话文件读取上限（超限截断，防止异常大文件拖垮浏览器）
AGENT_META_MAX_BYTES = 512 * 1024
AGENT_OUT_MAX_BYTES = 4 * 1024 * 1024
CLIENT_TAIL_MIN_BYTES = 256 * 1024        # /__flow_client_file 的 tail 下限
CLIENT_TAIL_MAX_BYTES = 16 * 1024 * 1024  # tail 上限
CLIENT_USAGE_TTL = 20.0                   # 多客户端用量聚合缓存（秒）
_USAGE_CACHE = {"t": 0.0, "key": None, "v": None}


def _local_dt(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone()
    except Exception:
        return None


def _rec_usage(rec):
    """从一条 rollout 记录里取令牌数；优先 response.usage（camelCase），回退 anthropic providerMetadata。"""
    resp = rec.get("response") or {}
    u = resp.get("usage")
    if not isinstance(u, dict) or not u:
        u = ((resp.get("providerMetadata") or {}).get("anthropic") or {}).get("usage") or {}
    if not isinstance(u, dict) or not u:
        return None

    def g(*keys):
        for k in keys:
            v = u.get(k)
            if isinstance(v, (int, float)):
                return int(v)
        return None

    i = g("inputTokens", "input_tokens")
    o = g("outputTokens", "output_tokens")
    t = g("totalTokens", "total_tokens")
    if i is None and o is None and t is None:
        return None
    i, o = i or 0, o or 0
    cr = g("cacheReadTokens", "cache_read_input_tokens") or 0
    cw = g("cacheWriteTokens", "cache_write_input_tokens") or 0
    if t is None:
        t = i + o
    return i, o, cr, cw, t


def _tool_name_plugin(name):
    """mcp__<server>__<tool> → 插件名 <server>；其他工具名 → None。"""
    if isinstance(name, str) and name.startswith("mcp__"):
        parts = name.split("__")
        if len(parts) >= 3 and parts[1]:
            return parts[1]
    return None


def _call_plugin(tc):
    """response.toolCalls 单项 → 归属插件：MCP 调用看服务器名前缀；Skill 调用看 input.skill 的 '插件:技能' 前缀。"""
    if not isinstance(tc, dict):
        return None
    name = tc.get("name") or ""
    p = _tool_name_plugin(name)
    if p:
        return p
    if name == "Skill":
        sk = str((tc.get("input") or {}).get("skill") or "")
        if sk:
            return sk.split(":", 1)[0] or None
    return None


def _rec_plugins(rec):
    """一条模型调用归属到的插件集合：本次发出的 toolCalls + delta 请求里新带回的工具结果（承接侧）。

    归属口径：模型调用触发/承接了某插件的工具，则该调用的全部令牌计入该插件；
    同一调用涉及多个插件时由调用方均分（整数均分、余数给第一个，保证总和可对账）；
    未涉及任何插件的调用（内置工具 / 纯对话）不计入插件，计入「未归属」。
    """
    plugs = set()
    for tc in ((rec.get("response") or {}).get("toolCalls") or []):
        p = _call_plugin(tc)
        if p:
            plugs.add(p)
    req = rec.get("request") or {}
    if req.get("messagesKind") == "delta":
        for m in (req.get("messages") or []):
            if isinstance(m, dict) and m.get("role") == "tool":
                p = _tool_name_plugin(m.get("name"))
                if p:
                    plugs.add(p)
    return plugs


def scan_tokens(rollout_dir):
    """扫 rollout 目录的 model-io-sess_*.jsonl，聚合 token 用量（总量/按天/按模型/按会话/按插件）。

    按会话附「按日明细」与「按插件分摊」，供编辑器总控的 🪙 Token 区块展开查看。
    """
    zero = lambda: {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0, "calls": 0}
    out = {"ok": True, "totals": zero(), "byDay": {}, "byDayModel": {}, "byModel": {}, "bySession": {},
           "byPlugin": {}, "unattributed": zero(), "files": 0, "badLines": 0}

    def bump(d, key, nums, extra=None):
        b = d.setdefault(key, zero())
        b["input"] += nums[0]; b["output"] += nums[1]; b["cacheRead"] += nums[2]
        b["cacheWrite"] += nums[3]; b["total"] += nums[4]; b["calls"] += 1
        if extra: b.update(extra)

    def bump_into(b, nums, calls=1):
        b["input"] += nums[0]; b["output"] += nums[1]; b["cacheRead"] += nums[2]
        b["cacheWrite"] += nums[3]; b["total"] += nums[4]; b["calls"] += calls

    files = sorted(glob.glob(os.path.join(rollout_dir, "model-io-sess_*.jsonl")))
    for fp in files:
        out["files"] += 1
        sid = os.path.basename(fp).replace("model-io-sess_", "").replace(".jsonl", "")[:8]
        try:
            fh = open(fp, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    out["badLines"] += 1
                    continue
                nums = _rec_usage(rec)
                if not nums:
                    continue
                # 统一口径（与 Codex 一致）：输入为净输入（不含缓存读），保证「输入+缓存读+输出=合计」
                nums = (max(0, nums[0] - nums[2]), nums[1], nums[2], nums[3], nums[4])
                first = (rec.get("sessionId") or sid)
                model = ((rec.get("model") or {}).get("modelId")) or "(未知模型)"
                ts = _local_dt(rec.get("completedAt") or rec.get("startedAt"))
                t = out["totals"]
                t["input"] += nums[0]; t["output"] += nums[1]; t["cacheRead"] += nums[2]
                t["cacheWrite"] += nums[3]; t["total"] += nums[4]; t["calls"] += 1
                day_key = ts.strftime("%Y-%m-%d") if ts else None
                if ts:
                    bump(out["byDay"], day_key, nums)
                    bump(out["byDayModel"], (day_key, model), nums)
                bump(out["byModel"], model, nums)
                s = out["bySession"].setdefault(first, zero())
                s.setdefault("days", {})
                s.setdefault("plugins", {})
                s.setdefault("unattr", zero())
                bump_into(s, nums)
                if ts:
                    bump(s["days"], day_key, nums)
                    stamp = ts.strftime("%Y-%m-%d %H:%M")
                    if not s.get("last") or stamp > s["last"]:
                        s["last"] = stamp
                    if not s.get("first") or stamp < s["first"]:
                        s["first"] = stamp
                plugs = sorted(_rec_plugins(rec))
                if plugs:
                    k = len(plugs)
                    q = [nums[j] // k for j in range(5)]
                    rest = [nums[j] - q[j] * k for j in range(5)]
                    for idx, p in enumerate(plugs):
                        part = tuple(q[j] + (rest[j] if idx == 0 else 0) for j in range(5))
                        g = out["byPlugin"].setdefault(p, zero())
                        g.setdefault("sessions", set()).add(first)
                        bump_into(g, part)
                        sp = s["plugins"].setdefault(p, zero())
                        bump_into(sp, part)
                else:
                    bump_into(out["unattributed"], nums)
                    bump_into(s["unattr"], nums)
    out["byDay"] = [dict(day=k, **v) for k, v in sorted(out["byDay"].items())]
    out["byDayModel"] = [dict(day=k[0], model=k[1], **v) for k, v in sorted(out["byDayModel"].items())]
    out["byModel"] = sorted((dict(model=k, **v) for k, v in out["byModel"].items()), key=lambda x: -x["total"])
    out["byPlugin"] = sorted((dict(plugin=k, sessions=len(v.pop("sessions", set())), **v)
                              for k, v in out["byPlugin"].items()), key=lambda x: -x["total"])
    sessions = []
    out["totals"]["sessions"] = len(out["bySession"])
    for k, v in out["bySession"].items():
        v["days"] = [dict(day=dk, **dv) for dk, dv in sorted(v["days"].items())]
        v["plugins"] = sorted((dict(plugin=pk, **pv) for pk, pv in v["plugins"].items()), key=lambda x: -x["total"])
        sessions.append(dict(session=k, **v))
    out["bySession"] = sorted(sessions, key=lambda x: -x["total"])[:50]
    out["generated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return out


def _read_head_lines(fp, n, max_bytes=256 * 1024):
    """读文件头部若干行（会话元信息探测用；逐行按剩余字节预算截断，防超长行撑爆内存）。"""
    out, got = [], 0
    try:
        with open(fp, "rb") as f:
            for _ in range(n):
                if got >= max_bytes:
                    break
                line = f.readline(max_bytes - got)
                if not line:
                    break
                out.append(line.decode("utf-8", errors="replace"))
                got += len(line)
    except OSError:
        pass
    return out


def read_tail(fp, nbytes):
    """读文件末尾 nbytes 字节（先对齐到行边界），用于大会话文件的增量浏览；失败返回 None。"""
    try:
        size = os.path.getsize(fp)
        with open(fp, "rb") as f:
            if size > nbytes:
                f.seek(size - nbytes)
                data = f.read()
                nl = data.find(b"\n")
                data = data[nl + 1:] if nl >= 0 else data  # 无换行（单行文件）时退回原始窗口，避免整段静默为空
            else:
                data = f.read()
        return data.decode("utf-8", errors="replace")
    except OSError:
        return None


def list_codex_sessions(sessions_dir, limit=80):
    """列 Codex CLI 会话（sessions/YYYY/MM/DD/rollout-*.jsonl），读首行取会话 ID 与工作目录。"""
    items = []
    if not (sessions_dir and os.path.isdir(sessions_dir)):
        return items
    root = os.path.realpath(sessions_dir)
    for fp in glob.glob(os.path.join(root, "**", "rollout-*.jsonl"), recursive=True):
        try:
            st = os.stat(fp)
        except OSError:
            continue
        rel = os.path.relpath(fp, root).replace(os.sep, "/")
        sid, cwd = os.path.basename(fp)[len("rollout-"):-len(".jsonl")], ""
        head = _read_head_lines(fp, 1)
        if head:
            try:
                meta = json.loads(head[0]).get("payload") or {}
                sid = str(meta.get("id") or sid)
                cwd = str(meta.get("cwd") or "")
            except Exception:
                pass
        items.append({"id": rel, "name": os.path.basename(fp), "session": sid, "cwd": cwd,
                      "size": st.st_size, "mtime": int(st.st_mtime),
                      "mtimeText": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")})
    items.sort(key=lambda x: -x["mtime"])
    return items[:limit]


def _qoder_item(fp, proj, relname, sid, sub, parent):
    """Qoder 单个会话文件 → 列表项（cwd 从 transcript 头部 workspace-directories 取）。"""
    try:
        st = os.stat(fp)
    except OSError:
        return None
    cwd = ""
    for line in _read_head_lines(fp, 6):
        try:
            o = json.loads(line)
        except Exception:
            continue
        if o.get("type") == "workspace-directories":
            dirs = o.get("directories") or []
            if dirs:
                cwd = str(dirs[0])
            break
    return {"id": proj + "/" + relname, "name": relname.split("/")[-1], "session": sid,
            "cwd": cwd, "sub": sub, "parent": parent,
            "size": st.st_size, "mtime": int(st.st_mtime),
            "mtimeText": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")}


def list_qoder_sessions(qoder_dir, limit=80):
    """列 Qoder CLI 会话（projects/<项目>/<会话>.jsonl 与 <会话>/subagents/ 子智能体）。"""
    items = []
    proot = os.path.join(qoder_dir or "", "projects")
    if not (qoder_dir and os.path.isdir(proot)):
        return items
    root = os.path.realpath(proot)
    try:
        projs = sorted(os.listdir(root))
    except OSError:
        return items
    for proj in projs:
        if not DIRNAME_RE.match(proj):
            continue
        pp = os.path.join(root, proj)
        if not os.path.isdir(pp):
            continue
        try:
            names = sorted(os.listdir(pp))
        except OSError:
            continue
        for name in names:
            fp = os.path.join(pp, name)
            if os.path.isfile(fp) and name.endswith(".jsonl"):
                it = _qoder_item(fp, proj, name, name[:-len(".jsonl")], False, "")
                if it:
                    items.append(it)
            elif os.path.isdir(fp):
                subd = os.path.join(fp, "subagents")
                if not os.path.isdir(subd):
                    continue
                try:
                    subs = sorted(os.listdir(subd))
                except OSError:
                    continue
                sid0 = name  # 目录名即会话 id（不带扩展名）
                for an in subs:
                    ap = os.path.join(subd, an)
                    if not (os.path.isfile(ap) and an.endswith(".jsonl")):
                        continue
                    it = _qoder_item(ap, proj, name + "/subagents/" + an, sid0, True, sid0)
                    if it:
                        items.append(it)
    items.sort(key=lambda x: -x["mtime"])
    return items[:limit]


def _bump5(d, key, nums):
    b = d.setdefault(key, {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0, "calls": 0})
    b["input"] += nums[0]; b["output"] += nums[1]; b["cacheRead"] += nums[2]
    b["cacheWrite"] += nums[3]; b["total"] += nums[4]; b["calls"] += 1
    return b


def scan_codex_tokens(sessions_dir, limit=80):
    """扫 Codex CLI 会话的 token_usage_record（单次调用 usage），聚合总量/按天/按模型/按会话。

    Codex 口径：cached_input_tokens 是 input_tokens 的子集，展示时把缓存读从输入中拆出
    （输入 = input - cached，≥0），合计 = input + output（= 非缓存输入 + 缓存读 + 输出）。
    模型取每条记录前最近的 turn_context.payload.model。
    """
    zero = lambda: {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0, "calls": 0}
    out = {"ok": True, "available": True, "tokens": True, "label": "Codex CLI",
           "totals": zero(), "byDay": {}, "byDayModel": {}, "byModel": {}, "bySession": {},
           "files": 0, "badLines": 0}
    root = os.path.realpath(sessions_dir) if sessions_dir else ""
    for item in list_codex_sessions(sessions_dir, limit):
        fp = os.path.realpath(os.path.join(root, *item["id"].split("/")))
        try:
            if os.path.commonpath([root, fp]) != root or not os.path.isfile(fp):
                continue
        except Exception:
            continue
        out["files"] += 1
        sid, cwd = item["session"], item["cwd"]
        model = ""
        with open(fp, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                if '"token_usage_record"' not in line and '"turn_context"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    out["badLines"] += 1
                    continue
                t = rec.get("type")
                pl = rec.get("payload") or {}
                if t == "turn_context":
                    model = str(pl.get("model") or model or "(未知模型)")
                    continue
                if t != "token_usage_record":
                    continue
                u = pl.get("usage") or {}
                i = int(u.get("input_tokens") or 0)
                cr = int(u.get("cached_input_tokens") or 0)
                cw = int(u.get("cache_write_input_tokens") or 0)
                o = int(u.get("output_tokens") or 0)
                if not (i or cr or o):
                    continue
                nums = (max(0, i - cr), o, cr, cw, i + o)  # 顺序对齐 _bump5：输入/输出/缓存读/缓存写/合计
                ts = _local_dt(rec.get("timestamp"))
                for j, k in ((0, "input"), (1, "output"), (2, "cacheRead"), (3, "cacheWrite"), (4, "total")):
                    out["totals"][k] += nums[j]
                out["totals"]["calls"] += 1
                mname = model or "(未知模型)"
                day = ts.strftime("%Y-%m-%d") if ts else None
                if ts:
                    _bump5(out["byDay"], day, nums)
                    _bump5(out["byDayModel"], (day, mname), nums)
                _bump5(out["byModel"], mname, nums)
                s = out["bySession"].setdefault(sid, dict(zero(), session=sid, cwd=cwd, days={}, first="", last=""))
                for j, k in ((0, "input"), (1, "output"), (2, "cacheRead"), (3, "cacheWrite"), (4, "total")):
                    s[k] += nums[j]
                s["calls"] += 1
                if ts:
                    _bump5(s["days"], day, nums)
                    stamp = ts.strftime("%Y-%m-%d %H:%M")
                    if not s["last"] or stamp > s["last"]:
                        s["last"] = stamp
                    if not s["first"] or stamp < s["first"]:
                        s["first"] = stamp
    out["byDay"] = [dict(day=k, **v) for k, v in sorted(out["byDay"].items())]
    out["byDayModel"] = [dict(day=k[0], model=k[1], **v) for k, v in sorted(out["byDayModel"].items())]
    out["byModel"] = sorted((dict(model=k, **v) for k, v in out["byModel"].items()), key=lambda x: -x["total"])
    out["totals"]["sessions"] = len(out["bySession"])
    sess = []
    for k, v in out["bySession"].items():
        v["days"] = [dict(day=dk, **dv) for dk, dv in sorted(v["days"].items())]
        sess.append(v)
    out["bySession"] = sorted(sess, key=lambda x: -x["total"])[:40]
    out["generated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return out


def scan_qoder_calls(qoder_dir, limit=80):
    """扫 Qoder CLI 运行日志（logs/sessions/<项目>/<会话>/segments/*.jsonl）的模型调用事件。

    Qoder CLI 本地日志的令牌字段全为 0（实测 1131 个事件均为 0），故只统计调用次数与模型分布，
    并在 note 中注明；cwd 从 transcript 头部 workspace-directories 尽力而为。
    """
    zero1 = lambda: {"calls": 0, "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}
    out = {"ok": True, "available": True, "tokens": False, "label": "Qoder CLI",
           "note": "Qoder CLI 本地日志不记录令牌数（input/output 均为 0），按模型调用次数展示",
           "totals": dict(zero1(), sessions=0), "byDay": {}, "byDayModel": {}, "byModel": {},
           "bySession": {}, "files": 0}
    base = os.path.join(qoder_dir or "", "logs", "sessions")
    if not (qoder_dir and os.path.isdir(base)):
        out["available"] = False
        return out
    cwd_map = {}
    proot = os.path.join(qoder_dir, "projects")
    if os.path.isdir(proot):
        try:
            for proj in os.listdir(proot):
                pp = os.path.join(proot, proj)
                if not os.path.isdir(pp):
                    continue
                for name in os.listdir(pp):
                    if not name.endswith(".jsonl"):
                        continue
                    for line in _read_head_lines(os.path.join(pp, name), 6):
                        try:
                            o = json.loads(line)
                        except Exception:
                            continue
                        if o.get("type") == "workspace-directories":
                            dirs = o.get("directories") or []
                            if dirs:
                                cwd_map[name[:-len(".jsonl")]] = str(dirs[0])
                            break
        except OSError:
            pass
    root = os.path.realpath(base)
    for fp in glob.glob(os.path.join(root, "*", "*", "segments", "*.jsonl")):
        rel = os.path.relpath(fp, root).replace(os.sep, "/").split("/")
        if len(rel) != 4 or rel[2] != "segments":
            continue
        sid = rel[1]
        out["files"] += 1
        try:
            fh = open(fp, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if '"model.response.completed"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if rec.get("type") != "model.response.completed":
                    continue
                d = rec.get("data") or {}
                mname = str(d.get("model") or "(未知模型)")
                ts = _local_dt(rec.get("ts"))
                day = ts.strftime("%Y-%m-%d") if ts else None
                _bump5(out["byModel"], mname, (0, 0, 0, 0, 0))
                if ts:
                    _bump5(out["byDay"], day, (0, 0, 0, 0, 0))
                    _bump5(out["byDayModel"], (day, mname), (0, 0, 0, 0, 0))
                s = out["bySession"].setdefault(sid, dict(zero1(), session=sid, cwd=cwd_map.get(sid, ""),
                                                              days={}, first="", last=""))
                s["calls"] += 1
                if ts:
                    _bump5(s["days"], day, (0, 0, 0, 0, 0))
                    stamp = ts.strftime("%Y-%m-%d %H:%M")
                    if not s["last"] or stamp > s["last"]:
                        s["last"] = stamp
                    if not s["first"] or stamp < s["first"]:
                        s["first"] = stamp
    out["byDay"] = [dict(day=k, **v) for k, v in sorted(out["byDay"].items())]
    out["byDayModel"] = [dict(day=k[0], model=k[1], **v) for k, v in sorted(out["byDayModel"].items())]
    out["byModel"] = sorted((dict(model=k, **v) for k, v in out["byModel"].items()), key=lambda x: -x["calls"])
    out["totals"]["sessions"] = len(out["bySession"])
    out["totals"]["calls"] = sum(v["calls"] for v in out["bySession"].values())
    sess = []
    for k, v in out["bySession"].items():
        v["days"] = [dict(day=dk, **dv) for dk, dv in sorted(v["days"].items())]
        sess.append(v)
    out["bySession"] = sorted(sess, key=lambda x: -x["calls"])[:40]
    out["generated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return out


def _empty_client(label, tokens, note=""):
    """某客户端目录缺失时的空占位（结构与正常返回一致，方便编辑器统一渲染）。"""
    z = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0, "calls": 0}
    return {"label": label, "available": False, "tokens": tokens, "note": note,
            "totals": dict(z, sessions=0), "byDay": [], "byDayModel": [], "byModel": [],
            "bySession": [], "files": 0}


def client_usage(rollout_dir, codex_dir, qoder_dir):
    """三个代码客户端（ZCode / Codex CLI / Qoder CLI）用量聚合；带 20s 缓存避免重复全量扫描。"""
    key = (rollout_dir or "", codex_dir or "", qoder_dir or "")
    now = time.time()
    if _USAGE_CACHE["v"] is not None and _USAGE_CACHE["key"] == key and (now - _USAGE_CACHE["t"]) < CLIENT_USAGE_TTL:
        return _USAGE_CACHE["v"]
    clients = {}
    if rollout_dir and os.path.isdir(rollout_dir):
        zc = scan_tokens(rollout_dir)
        zc.pop("badLines", None)
        clients["zcode"] = dict(zc, label="ZCode", available=True, tokens=True)
    else:
        clients["zcode"] = _empty_client("ZCode", True)
    if codex_dir and os.path.isdir(codex_dir):
        cx = scan_codex_tokens(codex_dir)
        cx.pop("badLines", None)
        clients["codex"] = cx
    else:
        clients["codex"] = _empty_client("Codex CLI", True)
    clients["qoder"] = scan_qoder_calls(qoder_dir) if (qoder_dir and os.path.isdir(qoder_dir)) \
        else _empty_client("Qoder CLI", False)
    v = {"ok": True, "generated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "clients": clients}
    _USAGE_CACHE.update({"t": now, "key": key, "v": v})
    return v


def _skill_meta(path):
    """从 SKILL.md 头部 frontmatter 提取 name/description（容错，失败返回空串）。"""
    name = desc = ""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            head = [f.readline().rstrip("\n") for _ in range(40)]
        if head and head[0].strip() == "---":
            for line in head[1:]:
                if line.strip() == "---":
                    break
                if line.startswith("name:"):
                    name = line[5:].strip().strip("\"'")
                elif line.startswith("description:"):
                    desc = line[12:].strip().strip("\"'")
    except OSError:
        pass
    return name, desc


def scan_skills(draft_dir, install_dir):
    """列两个技能目录下的 <slug>/SKILL.md（草稿目录 + 插件安装目录）。"""
    def one(root, src):
        items = []
        if root and os.path.isdir(root):
            for slug in sorted(os.listdir(root)):
                if not SLUG_RE.match(slug):
                    continue
                fp = os.path.join(root, slug, "SKILL.md")
                if not os.path.isfile(fp):
                    continue
                try:
                    st = os.stat(fp)
                except OSError:
                    continue
                name, desc = _skill_meta(fp)
                items.append({"slug": slug, "name": name, "description": desc, "src": src,
                              "bytes": st.st_size,
                              "mtime": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")})
        return items
    return {"ok": True, "drafts": one(draft_dir, "draft"), "installed": one(install_dir, "install"),
            "draftDir": draft_dir, "installDir": install_dir}


def rollout_files(rollout_dir):
    """列 rollout 目录的会话文件（按 mtime 倒序，供编辑器自动载入最新会话）。"""
    items = []
    if rollout_dir and os.path.isdir(rollout_dir):
        for fp in glob.glob(os.path.join(rollout_dir, "model-io-sess_*.jsonl")):
            name = os.path.basename(fp)
            try:
                st = os.stat(fp)
            except OSError:
                continue
            sid = name[len("model-io-sess_"):-len(".jsonl")]
            items.append({"name": name, "session": sid, "size": st.st_size,
                          "mtime": int(st.st_mtime),
                          "mtimeText": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")})
    items.sort(key=lambda x: -x["mtime"])
    return items[:100]


def scan_agents(agents_dir):
    """扫 agents/<sess_*>*/<agent_*>*/ 的子智能体目录（metadata.json + output.txt/task.output）。

    只返回轻量元信息（不含 prompt 全文），编辑器按需再取 /__flow_agent 读原文。
    """
    items = []
    if not (agents_dir and os.path.isdir(agents_dir)):
        return items
    try:
        sessions = sorted(os.listdir(agents_dir))
    except OSError:
        return items
    for sess in sessions:
        sp = os.path.join(agents_dir, sess)
        if not os.path.isdir(sp):
            continue
        snap = {}
        try:
            with open(os.path.join(sp, "metadata.json"), encoding="utf-8", errors="replace") as f:
                snap = json.load(f)
        except Exception:
            pass
        if not isinstance(snap, dict):
            snap = {}
        name, _desc = snap.get("name"), snap.get("description")
        try:
            agents = sorted(os.listdir(sp))
        except OSError:
            continue
        for ag in agents:
            ap = os.path.join(sp, ag)
            mp = os.path.join(ap, "metadata.json")
            if not os.path.isdir(ap) or not os.path.isfile(mp):
                continue
            try:
                with open(mp, encoding="utf-8", errors="replace") as f:
                    meta = json.load(f)
            except Exception:
                meta = {}
            if not isinstance(meta, dict):
                meta = {}
            outp = os.path.join(ap, "output.txt")
            if not os.path.isfile(outp):
                outp = os.path.join(ap, "task.output")
            has_out = os.path.isfile(outp)
            try:
                mt = os.stat(mp).st_mtime
                if has_out:
                    mt = max(mt, os.stat(outp).st_mtime)
                out_chars = os.stat(outp).st_size if has_out else 0
            except OSError:
                mt, out_chars = 0, 0
            items.append({
                "path": sess + "/" + ag, "session": sess, "agent": ag,
                "profile": str(meta.get("profileId") or (meta.get("profileSnapshot") or {}).get("name") or "subagent"),
                "description": str(meta.get("description") or ""),
                "status": str(meta.get("status") or ""),
                "parentSession": str(meta.get("parentSessionId") or ""),
                "createdAt": str(meta.get("createdAt") or ""),
                "name": str(name or ""), "nameDesc": str(_desc or ""),
                "hasOutput": has_out, "outBytes": out_chars,
                "mtime": int(mt),
                "mtimeText": datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M") if mt else "",
            })
    items.sort(key=lambda x: -x["mtime"])
    return items[:300]


def default_paths():
    home = os.path.expanduser("~")
    repo = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    return (os.path.join(home, ".zcode", "codex-manager", "usage.jsonl"),
            os.path.join(home, ".zcode", "cli", "rollout"),
            os.path.join(home, ".zcode", "cli", "agents"),
            os.path.join(home, ".zcode", "codex-manager", "skills"),
            os.path.join(repo, "skills"),
            os.path.join(home, ".codex", "sessions"),
            os.path.join(home, ".qoder-cn"))


SETTINGS_KEYS = ("usage", "rollout", "agents", "codex", "qoder")
KEY_ATTR = {"usage": "usage_path", "rollout": "rollout_dir", "agents": "agents_dir",
            "codex": "codex_dir", "qoder": "qoder_dir"}


def settings_file():
    return os.path.join(os.path.expanduser("~"), ".zcode", "codex-manager", "flow-settings.json")


def settings_load():
    """读取 flow-settings.json 的路径覆盖值；文件缺失/损坏/类型不符时忽略，返回 {}。"""
    try:
        with open(settings_file(), encoding="utf-8") as f:
            obj = json.load(f)
    except Exception:
        return {}
    if not isinstance(obj, dict):
        return {}
    return {k: obj[k].strip() for k in SETTINGS_KEYS
            if isinstance(obj.get(k), str) and obj[k].strip()}


def settings_save(saved):
    path = settings_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(saved, ensure_ascii=False, indent=2) + "\n"
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix=".flow-settings-", dir=d)
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    watch = "flow-source.mmd"
    root = "."
    usage_path = ""
    rollout_dir = ""
    agents_dir = ""
    skills_dir = ""
    skills_install = ""
    codex_dir = ""
    qoder_dir = ""
    settings_saved = {}      # flow-settings.json 中已保存的覆盖值（内存副本）
    settings_cli = {}        # 启动参数显式指定的路径（优先级最高，设置不可覆盖）
    settings_default = {}    # 各键的出厂默认路径

    def watch_path(self):
        try:
            root = os.path.realpath(self.root)
            p = os.path.realpath(os.path.join(root, self.watch))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def rollout_path(self, name):
        """rollout 文件名 → 会话文件绝对路径；名字不符或越界返回 None。"""
        if not (self.rollout_dir and isinstance(name, str) and ROLLOUT_FILE_RE.match(name)):
            return None
        try:
            root = os.path.realpath(self.rollout_dir)
            p = os.path.realpath(os.path.join(root, name))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def agent_path(self, path):
        """sess_x/agent_y 相对路径 → 子智能体目录绝对路径；不合法或越界返回 None。"""
        if not (self.agents_dir and isinstance(path, str)):
            return None
        parts = path.replace("\\", "/").split("/")
        if len(parts) != 2 or not DIRNAME_RE.match(parts[0]) or not DIRNAME_RE.match(parts[1]):
            return None
        try:
            root = os.path.realpath(self.agents_dir)
            p = os.path.realpath(os.path.join(root, parts[0], parts[1]))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def codex_path(self, rel):
        """YYYY/MM/DD/rollout-*.jsonl 相对路径 → Codex 会话文件绝对路径；不合法或越界返回 None。"""
        if not (self.codex_dir and isinstance(rel, str)):
            return None
        parts = rel.replace("\\", "/").split("/")
        if len(parts) != 4 or not parts[3].endswith(".jsonl"):
            return None
        if not all(DIRNAME_RE.match(p) for p in parts):
            return None
        try:
            root = os.path.realpath(self.codex_dir)
            p = os.path.realpath(os.path.join(root, *parts))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def qoder_path(self, rel):
        """<项目>/<会话>.jsonl 或 <项目>/<会话>/subagents/<agent>.jsonl → 绝对路径；不合法返回 None。"""
        if not (self.qoder_dir and isinstance(rel, str)):
            return None
        parts = rel.replace("\\", "/").split("/")
        if len(parts) == 2:
            ok = parts[1].endswith(".jsonl")
        elif len(parts) == 4:
            ok = parts[2] == "subagents" and parts[3].endswith(".jsonl")
        else:
            ok = False
        if not ok or not all(DIRNAME_RE.match(p) for p in parts):
            return None
        try:
            root = os.path.realpath(os.path.join(self.qoder_dir, "projects"))
            p = os.path.realpath(os.path.join(root, *parts))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def skill_path(self, slug, target):
        """slug + 目标（draft/install）→ SKILL.md 绝对路径；不合法或越界返回 None。"""
        root = self.skills_install if target == "install" else self.skills_dir
        if not root or not isinstance(slug, str) or not SLUG_RE.match(slug):
            return None
        try:
            root = os.path.realpath(root)
            p = os.path.realpath(os.path.join(root, slug, "SKILL.md"))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def end_headers(self):
        # 本地开发场景：一律禁缓存，改完文件刷新即见
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_text(self, code, text):
        data = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def local_only(self):
        """仅接受本机来源：Host 必须指向 127.0.0.1 / localhost / ::1，浏览器请求的 Origin 同理。
        本地端口无鉴权，此校验用于防 DNS rebinding 读取会话数据与跨站表单/文本 POST 写入文件。"""
        host = (self.headers.get("Host") or "").strip().lower()
        if host:
            if host.startswith("[") and "]" in host:
                name = host[1:host.index("]")]
            else:
                name = host.split(":", 1)[0]
            if name not in ("127.0.0.1", "localhost", "::1"):
                self.send_json(403, {"ok": False, "error": "仅允许本机访问：Host 校验失败"})
                return False
        origin = (self.headers.get("Origin") or "").strip().lower()
        if origin and not re.match(r"^https?://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$", origin):
            self.send_json(403, {"ok": False, "error": "仅允许本机来源：Origin 校验失败"})
            return False
        return True

    def do_GET(self):
        if not self.local_only():
            return
        path = self.path.split("?", 1)[0]
        if path == "/__flow_ping":
            w = self.watch_path()
            self.send_json(200, {
                "ok": bool(w),
                "watch": self.watch,
                "exists": bool(w and os.path.isfile(w)),
                "port": self.server.server_address[1],
                "usage": bool(self.usage_path and os.path.isfile(self.usage_path)),
                "tokens": bool(self.rollout_dir and os.path.isdir(self.rollout_dir)),
                "rollout": bool(self.rollout_dir and os.path.isdir(self.rollout_dir)),
                "agents": bool(self.agents_dir and os.path.isdir(self.agents_dir)),
                "skills": bool(self.skills_dir),
                "skillsInstall": bool(self.skills_install),
                "codex": bool(self.codex_dir and os.path.isdir(self.codex_dir)),
                "qoder": bool(self.qoder_dir and os.path.isdir(self.qoder_dir)),
                "clients": True,  # /__flow_clients 端点存在（多客户端会话列表）
                "settings": True,  # /__flow_settings 端点存在（数据来源目录设置）
                "clientUsage": bool((self.rollout_dir and os.path.isdir(self.rollout_dir))
                                    or (self.codex_dir and os.path.isdir(self.codex_dir))
                                    or (self.qoder_dir and os.path.isdir(self.qoder_dir))),
            })
            return
        if path == "/__flow_settings":
            self.send_json(200, self.settings_view())
            return
        if path == "/__flow_usage":
            # 给编辑器自动载入 usage.jsonl（Agent Skills/轨迹查询/总控使用量共用）
            if not (self.usage_path and os.path.isfile(self.usage_path)):
                self.send_json(404, {"ok": False, "error": "usage.jsonl 不存在：%s" % self.usage_path})
                return
            try:
                with open(self.usage_path, encoding="utf-8", errors="replace") as f:
                    self.send_text(200, f.read())
            except OSError as e:
                self.send_json(500, {"ok": False, "error": "读取失败：%s" % e})
            return
        if path == "/__flow_tokens":
            if not (self.rollout_dir and os.path.isdir(self.rollout_dir)):
                self.send_json(404, {"ok": False, "error": "rollout 目录不存在：%s" % self.rollout_dir})
                return
            self.send_json(200, scan_tokens(self.rollout_dir))
            return
        if path == "/__flow_rollout":
            self.send_json(200, {"ok": True, "dir": self.rollout_dir,
                                 "files": rollout_files(self.rollout_dir)})
            return
        if path == "/__flow_rollout_file":
            qs = parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            name = (qs.get("name") or [""])[0]
            fp = self.rollout_path(name)
            if not fp:
                self.send_json(400, {"ok": False, "error": "会话文件名不合法"})
                return
            if not os.path.isfile(fp):
                self.send_json(404, {"ok": False, "error": "会话文件不存在：%s" % name})
                return
            try:
                with open(fp, "rb") as f:
                    text = f.read(ROLLOUT_MAX_BYTES).decode("utf-8", errors="replace")
            except OSError as e:
                self.send_json(500, {"ok": False, "error": "读取失败：%s" % e})
                return
            self.send_text(200, text)
            return
        if path == "/__flow_agents":
            self.send_json(200, {"ok": True, "dir": self.agents_dir,
                                 "items": scan_agents(self.agents_dir)})
            return
        if path == "/__flow_agent":
            qs = parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            rel = (qs.get("path") or [""])[0]
            ap = self.agent_path(rel)
            if not ap:
                self.send_json(400, {"ok": False, "error": "子智能体路径不合法"})
                return
            mp = os.path.join(ap, "metadata.json")
            if not os.path.isfile(mp):
                self.send_json(404, {"ok": False, "error": "metadata.json 不存在"})
                return
            outp = os.path.join(ap, "output.txt")
            if not os.path.isfile(outp):
                outp = os.path.join(ap, "task.output")
            try:
                with open(mp, "rb") as f:
                    meta = f.read(AGENT_META_MAX_BYTES).decode("utf-8", errors="replace")
                out = ""
                if os.path.isfile(outp):
                    with open(outp, "rb") as f:
                        out = f.read(AGENT_OUT_MAX_BYTES).decode("utf-8", errors="replace")
            except OSError as e:
                self.send_json(500, {"ok": False, "error": "读取失败：%s" % e})
                return
            self.send_json(200, {"ok": True, "path": rel, "meta": meta, "output": out})
            return
        if path == "/__flow_clients":
            zc = [dict(f, id=f.get("session"), client="zcode", sub=False, cwd="") for f in rollout_files(self.rollout_dir)]
            cx = [dict(f, client="codex", sub=False) for f in list_codex_sessions(self.codex_dir)]
            qd = [dict(f, client="qoder") for f in list_qoder_sessions(self.qoder_dir)]
            self.send_json(200, {"ok": True, "clients": [
                {"id": "zcode", "label": "ZCode", "dir": self.rollout_dir, "tokens": True,
                 "available": bool(self.rollout_dir and os.path.isdir(self.rollout_dir)), "sessions": zc},
                {"id": "codex", "label": "Codex CLI", "dir": self.codex_dir, "tokens": True,
                 "available": bool(self.codex_dir and os.path.isdir(self.codex_dir)), "sessions": cx},
                {"id": "qoder", "label": "Qoder CLI", "dir": self.qoder_dir, "tokens": False,
                 "available": bool(self.qoder_dir and os.path.isdir(self.qoder_dir)), "sessions": qd},
            ]})
            return
        if path == "/__flow_client_file":
            qs = parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            client = (qs.get("client") or [""])[0]
            cid = (qs.get("id") or [""])[0]
            raw_tail = (qs.get("tail") or [""])[0]
            if raw_tail == "":
                tail = 0  # 不传 = 全量（仍受 ROLLOUT_MAX_BYTES 上限）
            else:
                try:
                    tail = int(raw_tail)
                except ValueError:
                    tail = CLIENT_TAIL_MIN_BYTES  # 非法值按最小窗口处理，而不是误读全量
            tail = max(0, min(tail, CLIENT_TAIL_MAX_BYTES))
            if 0 < tail < CLIENT_TAIL_MIN_BYTES:
                tail = CLIENT_TAIL_MIN_BYTES
            fp = None
            if client == "zcode" and ID_RE.match(cid):
                fp = self.rollout_path("model-io-sess_" + cid + ".jsonl")
            elif client == "codex":
                fp = self.codex_path(cid)
            elif client == "qoder":
                fp = self.qoder_path(cid)
            if not fp:
                self.send_json(400, {"ok": False, "error": "客户端或文件 ID 不合法"})
                return
            if not os.path.isfile(fp):
                self.send_json(404, {"ok": False, "error": "会话文件不存在：%s" % cid})
                return
            try:
                if tail and os.path.getsize(fp) > tail:
                    text = read_tail(fp, tail)
                    if text is None:
                        raise OSError("tail 读取失败")
                else:
                    with open(fp, "rb") as f:
                        text = f.read(ROLLOUT_MAX_BYTES).decode("utf-8", errors="replace")
            except OSError as e:
                self.send_json(500, {"ok": False, "error": "读取失败：%s" % e})
                return
            self.send_text(200, text)
            return
        if path == "/__flow_client_usage":
            self.send_json(200, client_usage(self.rollout_dir, self.codex_dir, self.qoder_dir))
            return
        if path == "/__flow_skills":
            self.send_json(200, scan_skills(self.skills_dir, self.skills_install))
            return
        if path == "/__flow_skill":
            qs = parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            slug = (qs.get("slug") or [""])[0]
            target = (qs.get("src") or ["draft"])[0]
            fp = self.skill_path(slug, target)
            if not fp:
                self.send_json(400, {"ok": False, "error": "slug 不合法或目标错误"})
                return
            if not os.path.isfile(fp):
                self.send_json(404, {"ok": False, "error": "技能文件不存在：%s" % fp})
                return
            try:
                with open(fp, encoding="utf-8", errors="replace") as f:
                    self.send_text(200, f.read())
            except OSError as e:
                self.send_json(500, {"ok": False, "error": "读取失败：%s" % e})
            return
        if path in ("/", "/index.html"):
            editor = os.path.join(os.path.realpath(self.root), "flow-editor.html")
            if os.path.isfile(editor):
                self.send_response(302)
                self.send_header("Location", "/flow-editor.html")
                self.end_headers()
                return
        super().do_GET()

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def write_atomic(self, path, text):
        d = os.path.dirname(path) or "."
        fd, tmp = tempfile.mkstemp(prefix=".flow-write-", dir=d)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)

    def do_POST(self):
        if not self.local_only():
            return
        path = self.path.split("?", 1)[0]
        if path == "/__flow_skill":
            self.post_skill()
            return
        if path == "/__flow_settings":
            self.post_settings()
            return
        if path != "/__flow_write":
            self.send_json(404, {"ok": False, "error": "unknown endpoint"})
            return
        w = self.watch_path()
        if not w:
            self.send_json(400, {"ok": False, "error": "watch 文件路径不合法"})
            return
        try:
            body = self.read_body()
            text = body.get("text")
            if not isinstance(text, str):
                raise ValueError("缺少 text 字段")
        except Exception as e:
            self.send_json(400, {"ok": False, "error": "请求体解析失败：%s" % e})
            return
        try:
            self.write_atomic(w, text)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "写入失败：%s" % e})
            return
        self.send_json(200, {"ok": True, "bytes": len(text.encode("utf-8"))})

    def post_skill(self):
        """保存技能草稿（target=draft）或安装到插件（target=install），均原子写。"""
        try:
            body = self.read_body()
            slug = str(body.get("slug") or "")
            target = body.get("target") or "draft"
            text = body.get("text")
            if not isinstance(text, str):
                raise ValueError("缺少 text 字段")
        except Exception as e:
            self.send_json(400, {"ok": False, "error": "请求体解析失败：%s" % e})
            return
        fp = self.skill_path(slug, target)
        if not fp:
            self.send_json(400, {"ok": False, "error": "slug 不合法（仅小写字母/数字/连字符，≤64 字符）或 target 错误"})
            return
        try:
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            self.write_atomic(fp, text)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "写入失败：%s" % e})
            return
        self.send_json(200, {"ok": True, "path": fp, "target": target,
                             "bytes": len(text.encode("utf-8"))})

    def settings_view(self):
        """数据来源目录设置视图：saved（文件覆盖）/cli（启动参数锁定）/default/effective/exists。"""
        effective = {k: getattr(self, KEY_ATTR[k]) for k in SETTINGS_KEYS}
        exists = {}
        for k in SETTINGS_KEYS:
            p = effective.get(k) or ""
            exists[k] = os.path.isfile(p) if k == "usage" else os.path.isdir(p)
        return {"ok": True, "file": settings_file(),
                "saved": dict(self.settings_saved), "cli": dict(self.settings_cli),
                "default": dict(self.settings_default), "effective": effective, "exists": exists}

    def post_settings(self):
        """保存数据来源目录：键固定 5 个、值须为绝对路径字符串（空=清除覆盖）；
        CLI 锁定的键保持不变；未锁定的立即生效并原子落盘。"""
        try:
            body = self.read_body()
            paths = body.get("paths")
            if not isinstance(paths, dict):
                raise ValueError("缺少 paths 字段")
        except Exception as e:
            self.send_json(400, {"ok": False, "error": "请求体解析失败：%s" % e})
            return
        saved = dict(self.settings_saved)
        locked, bad, resolved = [], [], {}
        for k in SETTINGS_KEYS:
            if k not in paths:
                continue
            v = paths[k]
            if not isinstance(v, str):
                bad.append(k)
                continue
            v = os.path.expandvars(os.path.expanduser(v.strip()))
            if v and not os.path.isabs(v):
                bad.append(k)
                continue
            resolved[k] = v
        if bad:
            self.send_json(400, {"ok": False, "error": "以下路径无效（需为绝对路径）：%s" % ", ".join(bad)})
            return
        applied = {}
        for k, v in resolved.items():
            if v and k in self.settings_cli:
                locked.append(k)
                continue
            if v:
                saved[k] = v
            else:
                saved.pop(k, None)
            applied[k] = v or (self.settings_cli.get(k) or self.settings_default.get(k) or "")
        try:
            settings_save(saved)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "设置写入失败：%s" % e})
            return
        for k, v in applied.items():
            setattr(type(self), KEY_ATTR[k], v)  # 改类属性：后续所有请求立即用新路径
        type(self).settings_saved = saved
        self.send_json(200, {"ok": True, "locked": locked, "view": self.settings_view()})

    def log_message(self, fmt, *args):
        line = fmt % args
        if "__flow_ping" in line or "GET /flow-" in line:
            return  # 轮询不刷屏
        sys.stderr.write("  [flow_serve] %s\n" % line)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="codex-flow-edit 本地托管服务")
    ap.add_argument("--dir", default=".", help="静态托管目录（编辑器与源文件所在目录）")
    ap.add_argument("--watch", default="flow-source.mmd", help="双向同步的目标文件（相对 --dir）")
    ap.add_argument("--port", type=int, default=8380, help="起始端口（被占用则依次 +1 重试）")
    ap.add_argument("--usage", default="", help="usage.jsonl 路径（默认 %%USERPROFILE%%\\.zcode\\codex-manager\\usage.jsonl）")
    ap.add_argument("--rollout", default="", help="ZCode rollout 目录（默认 %%USERPROFILE%%\\.zcode\\cli\\rollout，用于 token 统计与问答自动载入）")
    ap.add_argument("--agents", default="", help="ZCode 子智能体目录（默认 %%USERPROFILE%%\\.zcode\\cli\\agents，用于问答视图同步）")
    ap.add_argument("--skills", default="", help="技能草稿目录（默认 %%USERPROFILE%%\\.zcode\\codex-manager\\skills）")
    ap.add_argument("--skills-install", default="", help="技能安装目录（默认 <插件仓库>\\skills）")
    ap.add_argument("--codex", default="", help="Codex CLI 会话目录（默认 %%USERPROFILE%%\\.codex\\sessions）")
    ap.add_argument("--qoder", default="", help="Qoder CLI 数据目录（默认 %%USERPROFILE%%\\.qoder-cn）")
    ap.add_argument("--open", action="store_true", help="启动后自动用默认浏览器打开编辑器")
    a = ap.parse_args()

    root = os.path.realpath(a.dir)
    if not os.path.isdir(root):
        print("目录不存在：%s" % root, file=sys.stderr)
        sys.exit(2)
    d_usage, d_rollout, d_agents, d_skills, d_skills_install, d_codex, d_qoder = default_paths()
    cli_paths = {k: v for k, v in (("usage", a.usage), ("rollout", a.rollout), ("agents", a.agents),
                                   ("codex", a.codex), ("qoder", a.qoder)) if v}
    defaults = {"usage": d_usage, "rollout": d_rollout, "agents": d_agents,
                "codex": d_codex, "qoder": d_qoder}
    saved = settings_load()
    Handler.root = root
    Handler.watch = a.watch
    Handler.settings_cli = cli_paths
    Handler.settings_default = defaults
    Handler.settings_saved = saved
    for k in SETTINGS_KEYS:
        setattr(Handler, KEY_ATTR[k], cli_paths.get(k) or saved.get(k) or defaults[k])
    Handler.skills_dir = a.skills or d_skills
    Handler.skills_install = a.skills_install or d_skills_install

    httpd = None
    for port in range(a.port, a.port + 12):
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=root))
            break
        except OSError:
            continue
    if httpd is None:
        print("端口 %d~%d 都被占用，请用 --port 指定其他端口" % (a.port, a.port + 11), file=sys.stderr)
        sys.exit(3)

    port = httpd.server_address[1]
    url = "http://127.0.0.1:%d/flow-editor.html" % port
    print("flow_serve 已启动：root=%s  watch=%s" % (root, a.watch))
    print("  usage=%s（%s）" % (Handler.usage_path, "存在" if os.path.isfile(Handler.usage_path) else "缺失"))
    print("  rollout=%s（%s）" % (Handler.rollout_dir, "存在" if os.path.isdir(Handler.rollout_dir) else "缺失"))
    print("  agents=%s（%s）" % (Handler.agents_dir, "存在" if os.path.isdir(Handler.agents_dir) else "缺失"))
    print("  skills=%s（%s）" % (Handler.skills_dir, "存在" if os.path.isdir(Handler.skills_dir) else "缺失，保存草稿时自动创建"))
    print("  skills-install=%s（%s）" % (Handler.skills_install, "存在" if os.path.isdir(Handler.skills_install) else "缺失，安装技能时自动创建"))
    print("  codex=%s（%s）" % (Handler.codex_dir, "存在" if os.path.isdir(Handler.codex_dir) else "缺失"))
    print("  qoder=%s（%s）" % (Handler.qoder_dir, "存在" if os.path.isdir(Handler.qoder_dir) else "缺失"))
    print("  设置文件=%s（%s）" % (settings_file(),
          ("已保存覆盖：" + ", ".join(sorted(saved))) if saved else "无覆盖，可在编辑器 ⚙ 设置中修改"))
    print("FLOW_SERVE_URL=%s" % url)
    if a.open:
        import webbrowser
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
