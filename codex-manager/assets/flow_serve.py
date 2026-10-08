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
 12. GET  /__flow_agents_registry → 注册表视图：所有「已知智能体」的连接状态（已连接/未安装/未发现）
     与对话画布统计（会话数、子智能体数、最近活跃时间）；编辑器「已连接智能体」分类用；
 13. GET  /__flow_clients → 列所有已连接智能体的会话文件（遍历适配器注册表；含各客户端子智能体）；
 14. GET  /__flow_client_file?client=&id=&tail= → 读指定客户端会话原文（tail=末尾字节数，大文件增量浏览）；
 15. GET  /__flow_client_usage → 多智能体用量聚合（遍历注册表：有令牌的给令牌明细，无令牌的给调用数，20s 缓存）；
 16. GET  /__flow_settings → 数据来源目录设置视图（saved/cli/default/effective/exists/prices）；
 16. POST /__flow_settings {"paths":{...},"prices":{...}} → 保存数据来源目录（usage/rollout/agents/
     codex/qoder）与模型单价（估算费用用，每百万 token 美元），写入
     ~/.zcode/codex-manager/flow-settings.json 并立即生效（空串=清除覆盖；
     启动参数指定的路径优先，不受设置覆盖）；
 17. POST /__flow_settings {"paths":{...},"prices":{...}} → 保存数据来源目录（usage/rollout/agents/
     codex/qoder/gemini）与模型单价（估算费用用，每百万 token 美元），写入
     ~/.zcode/codex-manager/flow-settings.json 并立即生效（空串=清除覆盖；
     启动参数指定的路径优先，不受设置覆盖）；
 18. GET  /__flow_wf_state → 工作流树自动备份（整树 JSON，含对话画布与小对话结构）；
 19. POST /__flow_wf_state {"tree":{...}} → 原子写入 ~/.zcode/codex-manager/wf-backup.json
     （编辑器每次改动防抖回传；rev 重播种/清空浏览器存档后可从它恢复对话画布）。

多智能体接入架构（v0.21.0 起）
  原本硬编码 ZCode / Codex CLI / Qoder CLI 三家，现改为「适配器注册表」：
  每个智能体客户端实现一个 Adapter（list_sessions / resolve / scan_usage / capabilities），
  注册进 ADAPTERS 后，/__flow_clients、/__flow_client_file、/__flow_client_usage、
  /__flow_agents_registry 与 ⚙ 设置全部自动遍历它。
  · 新增一个智能体只需：写一个探测函数（返回 sessions 列表 + 用量聚合）+ 加一条 ADAPTERS 记录 + 可选加一个 SETTINGS 路径键。
  · 已知但未安装 / 装了但无会话的智能体，也会出现在注册表里并如实标注状态（never 编造会话）。
  · 已内置适配器：ZCode、Codex CLI、Qoder CLI、Gemini（Antigravity）。

安全约束：只绑定 127.0.0.1；写回目标固定为 --watch 指定的单个文件、技能目录下的
SKILL.md、设置文件 flow-settings.json 或工作流备份 wf-backup.json，slug 必须匹配
^[a-z0-9][a-z0-9-]{0,63}$，会话/子智能体/客户端文件路径按名字正则校验且解析后的真实
路径必须位于对应根目录之内（防目录穿越）；设置值必须为绝对路径字符串；单价须为有限
非负数；工作流备份须为含 list 数组的对象且 ≤8MB；会话文件与客户端文件读取均有字节上限。
"""
import argparse
import glob
import json
import math
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
WF_STATE_MAX_BYTES = 8 * 1024 * 1024      # /__flow_wf_state 工作流树备份上限
WF_STATE_MAX_CANVASES = 300               # 备份中画布数量上限
# v0.27.6 「正在改动中的文件」检测：扫描服务根目录下最近 N 分钟改动过的源码/文档文件
RECENT_SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".zcode", ".workbuddy",
    ".idea", ".vscode", ".venv", "venv", "env", "dist", "build", "out", "target",
    ".next", ".nuxt", ".cache", "coverage", ".pytest_cache", ".mypy_cache",
}
RECENT_EXTS = {
    ".mmd", ".md", ".markdown", ".txt", ".json", ".jsonl", ".csv", ".yml", ".yaml", ".toml", ".ini", ".env",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".svelte", ".html", ".htm", ".css", ".scss", ".less",
    ".py", ".java", ".kt", ".go", ".rs", ".rb", ".php", ".cs", ".c", ".h", ".cc", ".cpp", ".hpp",
    ".sql", ".sh", ".ps1", ".bat", ".xml", ".gradle", ".properties",
}
RECENT_MAX_SCAN = 20000                   # 单次扫描的文件数上限（防止在巨大目录树上卡住）
PRICE_MAX_MODELS = 300                    # 单价表模型数上限
PRICE_MAX_VALUE = 1e6                     # 单价上限（防误输入）


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


# ---------------------------------------------------------------------------
# Gemini（Antigravity）适配器：会话存储在 brain/<uuid>/ 目录树（不是单一 jsonl）
# ---------------------------------------------------------------------------

GEMINI_MSG_MAX_BYTES = 6 * 1024 * 1024   # 单个 transcript 读取上限


def _gemini_session_dir(gemini_dir, sid):
    """会话 id → brain/<sid> 绝对路径；id 不合法或越界返回 None。"""
    if not (gemini_dir and isinstance(sid, str) and ID_RE.match(sid)):
        return None
    try:
        root = os.path.realpath(os.path.join(gemini_dir, "brain"))
        p = os.path.realpath(os.path.join(root, sid))
        if os.path.commonpath([root, p]) != root:
            return None
        return p
    except Exception:
        return None


def _gemini_transcript(sdir):
    """在会话目录里找对话正文（transcript.jsonl 优先），返回 (绝对路径, 相对路径)。

    Antigravity 的正文位于 .system_generated/logs/transcript.jsonl（完整版另有
    transcript_full.jsonl）。早期版本若无该文件，退化为「目录内最大的 .jsonl」。
    """
    logs = os.path.join(sdir, ".system_generated", "logs")
    for fn in ("transcript.jsonl", "transcript_full.jsonl"):
        fp = os.path.join(logs, fn)
        if os.path.isfile(fp):
            return fp, os.path.join(".system_generated", "logs", fn).replace(os.sep, "/")
    # 退化路径：全目录找最大的 jsonl（排除附件与缓存目录）
    best, best_sz = None, -1
    for dirpath, dirnames, filenames in os.walk(sdir):
        dirnames[:] = [d for d in dirnames if d not in ("tempmediaStorage", ".user_uploaded")]
        for fn in filenames:
            if not fn.lower().endswith(".jsonl"):
                continue
            fp = os.path.join(dirpath, fn)
            try:
                sz = os.stat(fp).st_size
            except OSError:
                continue
            if sz > best_sz:
                best, best_sz = fp, sz
    if not best:
        return None, ""
    return best, os.path.relpath(best, sdir).replace(os.sep, "/")


def list_gemini_sessions(gemini_dir, limit=80):
    """列 Gemini / Antigravity 会话（brain/<uuid>/ 目录树，uuid 即会话 id）。

    与另外三家的扁平 jsonl 不同：这里一个会话是一个目录，正文文件由其内部的
    transcript / messages 形态决定，故只返回目录级元信息 + 正文相对路径。
    """
    items = []
    broot = os.path.join(gemini_dir or "", "brain")
    if not (gemini_dir and os.path.isdir(broot)):
        return items
    root = os.path.realpath(broot)
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return items
    for sid in names:
        if sid == "tempmediaStorage" or not ID_RE.match(sid):
            continue
        sdir = os.path.join(root, sid)
        if not os.path.isdir(sdir):
            continue
        fp, rel = _gemini_transcript(sdir)
        mt, size = 0, 0
        try:
            mt = int(os.stat(sdir).st_mtime)
        except OSError:
            pass
        if fp:
            try:
                st = os.stat(fp)
                mt = max(mt, int(st.st_mtime))
                size = st.st_size
            except OSError:
                pass
        cwd = ""
        for line in _read_head_lines(os.path.join(sdir, ".system_generated", "logs", "metadata.json"), 4) \
                if os.path.isfile(os.path.join(sdir, ".system_generated", "logs", "metadata.json")) else []:
            try:
                o = json.loads(line)
                cwd = str(o.get("cwd") or o.get("workspace") or cwd)
            except Exception:
                continue
        items.append({"id": sid, "name": sid, "session": sid, "cwd": cwd,
                      "sub": False, "parent": "", "file": rel, "size": size,
                      "mtime": mt,
                      "mtimeText": datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M") if mt else ""})
    items.sort(key=lambda x: -x["mtime"])
    return items[:limit]


def scan_gemini_usage(gemini_dir, limit=80):
    """扫 Gemini / Antigravity 会话的模型调用。

    实测（2026-10，Antigravity）transcript.jsonl 只有 step_index / source / type /
    status / created_at / content / thinking，**不含任何 token 计数字段**，故本适配器
    tokens=False，只按模型响应步数统计调用次数——不编造 token 数。
    若将来版本加入 usageMetadata/promptTokenCount 之类的字段，下面的宽容解析会自动
    认出来并把 tokens 翻成 True。
    """
    zero = lambda: {"calls": 0, "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}
    out = {"ok": True, "available": True, "tokens": False, "label": "Gemini (Antigravity)",
           "note": "Antigravity transcript 不记录令牌数（实测无 usage 字段），按模型响应步数统计调用",
           "totals": dict(zero(), sessions=0), "byDay": {}, "byDayModel": {}, "byModel": {},
           "bySession": {}, "files": 0, "badLines": 0}
    if not (gemini_dir and os.path.isdir(os.path.join(gemini_dir, "brain"))):
        out["available"] = False
        return out
    # 产生模型响应/规划的记录类型：一个「步」即一次模型调用
    MODEL_KINDS = {"PLANNER_RESPONSE", "MODEL_RESPONSE", "MODEL", "ASSISTANT"}
    got_tokens = False
    for item in list_gemini_sessions(gemini_dir, limit):
        sdir = _gemini_session_dir(gemini_dir, item["id"])
        if not sdir:
            continue
        fp, _rel = _gemini_transcript(sdir)
        if not fp:
            continue
        out["files"] += 1
        sid, cwd = item["session"], item["cwd"]
        # 会话级模型名：Antigravity 在 USER_INPUT 正文的 <USER_SETTINGS_CHANGE> 里声明
        # 「Model Selection from X to Y」，先扫一遍头部拿到它，作为该会话后续步的模型归属。
        sess_model = ""
        for hline in _read_head_lines(fp, 40):
            hm = re.search(r"Model Selection`?\s*(?:from [^\n]*?)?\s*to ([^\n.<\"]{1,64})", hline)
            if hm:
                sess_model = hm.group(1).strip()
                break
        try:
            fh = open(fp, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    out["badLines"] += 1
                    continue
                if not isinstance(rec, dict):
                    continue
                rtype = str(rec.get("type") or rec.get("kind") or "")
                u = rec.get("usage") or rec.get("usageMetadata") \
                    or (rec.get("response") or {}).get("usageMetadata") or {}
                has_u = isinstance(u, dict) and any(
                    isinstance(u.get(k), (int, float)) and not isinstance(u.get(k), bool)
                    for k in ("promptTokenCount", "prompt_token_count", "inputTokens", "input_tokens",
                              "totalTokenCount", "total_tokens"))
                # 既不是模型响应步，又没有可认的 usage → 跳过（用户输入/工具输出等）
                if rtype not in MODEL_KINDS and not has_u:
                    continue
                ts = _local_dt(rec.get("created_at") or rec.get("timestamp")
                               or rec.get("ts") or rec.get("createdAt"))
                model = str(rec.get("model") or (rec.get("response") or {}).get("model") or "")
                if model:
                    mname = model
                elif sess_model:
                    mname = sess_model
                else:
                    # 从本条正文里再尽一次力（会话中途切换模型的场景）
                    body = str(rec.get("content") or "")
                    m = re.search(r"Model Selection`?\s*(?:from [^\n]*?)?\s*to ([^\n.<\"]{1,64})", body)
                    mname = m.group(1).strip() if m else "Gemini (未标注)"
                nums = (0, 0, 0, 0, 0)
                if has_u:
                    def got(*ks):
                        return next((int(u[k]) for k in ks
                                     if isinstance(u.get(k), (int, float)) and not isinstance(u.get(k), bool)), 0)
                    i = got("promptTokenCount", "prompt_token_count", "inputTokens", "input_tokens")
                    o = got("candidatesTokenCount", "candidates_token_count", "outputTokens", "output_tokens")
                    cr = got("cachedContentTokenCount", "cacheReadTokens", "cache_read_input_tokens")
                    cw = got("cacheWriteTokens", "cache_write_input_tokens")
                    t = got("totalTokenCount", "total_tokens", "totalTokens") or (i + o)
                    nums = (max(0, i - cr), o, cr, cw, t)
                    got_tokens = True
                day = ts.strftime("%Y-%m-%d") if ts else None
                for j, k in ((0, "input"), (1, "output"), (2, "cacheRead"), (3, "cacheWrite"), (4, "total")):
                    out["totals"][k] += nums[j]
                out["totals"]["calls"] += 1
                _bump5(out["byModel"], mname, nums)
                if ts:
                    _bump5(out["byDay"], day, nums)
                    _bump5(out["byDayModel"], (day, mname), nums)
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
    if got_tokens:
        # 该版本带 token 字段：翻成 True，note 也改成如实描述
        out["tokens"] = True
        out["note"] = "Antigravity 本地日志已含令牌字段，按宽容解析结果统计"
    else:
        out["totals"].update({k: 0 for k in ("input", "output", "cacheRead", "cacheWrite", "total")})
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


# ---------------------------------------------------------------------------
# Qwen Code 适配器：projects/<项目>/chats/<uuid>.runtime.json（仅运行时会话元信息）
# ---------------------------------------------------------------------------

def list_qwen_sessions(qwen_dir, limit=80):
    """列 Qwen Code 会话（projects/<项目>/chats/<uuid>.runtime.json）。

    Qwen Code 的 chats/ 下只写运行时会话元信息（session_id / work_dir / started_at /
    qwen_version），**不含对话正文**，故本适配器只提供「有哪些会话」这一层信息。
    """
    items = []
    if not qwen_dir:
        return items
    root = os.path.realpath(os.path.join(qwen_dir, "projects"))
    if not os.path.isdir(root):
        return items
    for fp in glob.glob(os.path.join(root, "*", "chats", "*.runtime.json")):
        try:
            rel = os.path.relpath(fp, root).replace(os.sep, "/")
            parts = rel.split("/")
            if len(parts) != 3 or parts[1] != "chats":
                continue
            st = os.stat(fp)
        except OSError:
            continue
        sid = os.path.basename(fp)[:-len(".runtime.json")]
        cwd, proj = "", parts[0]
        try:
            with open(fp, encoding="utf-8", errors="replace") as f:
                obj = json.load(f)
            if isinstance(obj, dict):
                sid = str(obj.get("session_id") or sid)
                cwd = str(obj.get("work_dir") or "")
        except Exception:
            pass
        relp = parts[0] + "/chats/" + os.path.basename(fp)
        items.append({"id": relp, "name": os.path.basename(fp), "session": sid,
                      "cwd": cwd, "project": proj, "sub": False, "parent": "",
                      "size": st.st_size, "mtime": int(st.st_mtime),
                      "mtimeText": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")})
    items.sort(key=lambda x: -x["mtime"])
    return items[:limit]


def scan_qwen_usage(qwen_dir, limit=80):
    """Qwen Code：本地只留运行时会话元信息，无对话正文、无令牌字段 → 只统计会话数。"""
    zero = lambda: {"calls": 0, "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}
    out = {"ok": True, "available": True, "tokens": False, "label": "Qwen Code",
           "note": "Qwen Code 本地仅保存会话元信息（无对话正文与令牌字段），只统计会话数量",
           "totals": dict(zero(), sessions=0), "byDay": [], "byDayModel": [], "byModel": [],
           "bySession": [], "files": 0}
    if not (qwen_dir and os.path.isdir(os.path.join(qwen_dir, "projects"))):
        out["available"] = False
        return out
    sess = []
    for it in list_qwen_sessions(qwen_dir, limit):
        out["files"] += 1
        ts = datetime.fromtimestamp(it["mtime"])
        sess.append({"session": it["session"], "cwd": it["cwd"], "calls": 1,
                     "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0,
                     "days": [], "first": ts.strftime("%Y-%m-%d %H:%M"),
                     "last": ts.strftime("%Y-%m-%d %H:%M")})
    out["totals"]["sessions"] = len(sess)
    out["totals"]["calls"] = len(sess)
    out["bySession"] = sorted(sess, key=lambda x: x["last"], reverse=True)[:40]
    out["generated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return out


# ---------------------------------------------------------------------------
# Kimi 适配器：.kimi-work 仅存放可执行文件（无会话数据）
# ---------------------------------------------------------------------------

def list_kimi_sessions(kimi_dir, limit=80):
    """Kimi：~/.kimi-work 下只有 bin/ 可执行文件，没有会话存储 → 恒为空。"""
    return []


def scan_kimi_usage(kimi_dir, limit=80):
    """Kimi：本地无对话/用量数据可读，如实返回空并在 note 中说明。"""
    zero = lambda: {"calls": 0, "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}
    return {"ok": True, "available": bool(kimi_dir and os.path.isdir(kimi_dir)),
            "tokens": False, "label": "Kimi",
            "note": "Kimi 桌面版本地不保存会话记录（~/.kimi-work 只有可执行文件），无可读数据",
            "totals": dict(zero(), sessions=0), "byDay": [], "byDayModel": [], "byModel": [],
            "bySession": [], "files": 0,
            "generated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


# ---------------------------------------------------------------------------
# WorkBuddy 适配器：projects/<项目>/<会话>.jsonl（完整对话 + usage 令牌 + 模型名）
# ---------------------------------------------------------------------------

WB_USAGE_MAX_BYTES = 32 * 1024 * 1024


def _wb_item(fp, proj, name):
    """WorkBuddy 单个会话文件 → 列表项（cwd 从首行 payload 取）。"""
    try:
        st = os.stat(fp)
    except OSError:
        return None
    cwd = ""
    for line in _read_head_lines(fp, 4):
        try:
            o = json.loads(line)
        except Exception:
            continue
        if isinstance(o, dict) and o.get("cwd"):
            cwd = str(o["cwd"])
            break
    return {"id": proj + "/" + name, "name": name, "session": name[:-len(".jsonl")],
            "cwd": cwd, "project": proj, "sub": False, "parent": "",
            "size": st.st_size, "mtime": int(st.st_mtime),
            "mtimeText": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")}


def list_wb_sessions(wb_dir, limit=80):
    """列 WorkBuddy 会话（projects/<项目>/<会话>.jsonl）。"""
    items = []
    if not wb_dir:
        return items
    root = os.path.realpath(os.path.join(wb_dir, "projects"))
    if not os.path.isdir(root):
        return items
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
            names = os.listdir(pp)
        except OSError:
            continue
        for name in names:
            if not name.endswith(".jsonl"):
                continue
            it = _wb_item(os.path.join(pp, name), proj, name)
            if it:
                items.append(it)
    items.sort(key=lambda x: -x["mtime"])
    return items[:limit]


def scan_wb_usage(wb_dir, limit=80):
    """扫 WorkBuddy 会话的 providerData.usage（含 inputTokens/outputTokens/缓存读）与模型名。

    口径：usage.inputTokens 是含缓存读的总输入，inputTokensDetails[].cached_tokens 为
    其中缓存命中部分；展示时拆出（输入 = input - cached，≥0），合计 = inputTokens + outputTokens。
    """
    zero = lambda: {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0, "calls": 0}
    out = {"ok": True, "available": True, "tokens": True, "label": "WorkBuddy",
           "totals": dict(zero(), sessions=0), "byDay": {}, "byDayModel": {}, "byModel": {},
           "bySession": {}, "files": 0, "badLines": 0}
    if not (wb_dir and os.path.isdir(os.path.join(wb_dir, "projects"))):
        out["available"] = False
        return out
    got = False
    for item in list_wb_sessions(wb_dir, limit):
        fp = os.path.join(wb_dir, "projects", *item["id"].split("/"))
        if not os.path.isfile(fp):
            continue
        out["files"] += 1
        sid, cwd = item["session"], item["cwd"]
        model = ""
        try:
            fh = open(fp, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for line in fh:
                if not line.strip():
                    continue
                if '"usage"' not in line and '"rawUsage"' not in line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    out["badLines"] += 1
                    continue
                if not isinstance(rec, dict):
                    continue
                pd = rec.get("providerData") or {}
                if not isinstance(pd, dict):
                    continue
                model = str(pd.get("model") or pd.get("requestModelName") or model)
                u = pd.get("usage") or pd.get("rawUsage") or {}
                if not isinstance(u, dict):
                    continue
                gi = lambda *ks: next((int(u[k]) for k in ks
                                       if isinstance(u.get(k), (int, float)) and not isinstance(u.get(k), bool)), 0)
                i = gi("inputTokens", "prompt_tokens")
                o = gi("outputTokens", "completion_tokens")
                t = gi("totalTokens", "total_tokens") or (i + o)
                if not (i or o or t):
                    continue
                cached = 0
                det = u.get("inputTokensDetails") or (u.get("prompt_tokens_details") or {})
                if isinstance(det, list):
                    cached = sum(int(d.get("cached_tokens") or 0) for d in det if isinstance(d, dict))
                elif isinstance(det, dict):
                    cached = int(det.get("cached_tokens") or 0)
                cw = 0
                nums = (max(0, i - cached), o, cached, cw, t)
                got = True
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
                s = out["bySession"].setdefault(sid, dict(zero(), session=sid, cwd=cwd,
                                                          project=item.get("project", ""),
                                                          days={}, first="", last=""))
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
    if not got:
        out["tokens"] = False
        out["note"] = "本机 WorkBuddy 会话中暂未解析到 usage 令牌字段"
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


# ---------------------------------------------------------------------------
# 适配器注册表：每个智能体客户端一条记录，全部端点与设置都从这里遍历
# ---------------------------------------------------------------------------

def _adapter(cid, label, attr, lister, usage, tokens=True, note="", group="cli"):
    """构造一条适配器记录。

    attr   → Handler 上保存该客户端目录的类属性名
    lister → (dir, limit) -> sessions 列表
    usage  → (dir, limit) -> 用量聚合 dict，或 None（无用量统计）
    """
    return {"id": cid, "label": label, "attr": attr, "lister": lister,
            "usage": usage, "tokens": tokens, "note": note, "group": group}


ADAPTERS = [
    _adapter("zcode", "ZCode", "rollout_dir",
             lambda d, n: [dict(f, id=f.get("session"), client="zcode", sub=False, cwd="")
                           for f in rollout_files(d)[:n]],
             lambda d, n: dict(scan_tokens(d), label="ZCode"),
             tokens=True, group="cli"),
    _adapter("codex", "Codex CLI", "codex_dir",
             lambda d, n: [dict(f, client="codex", sub=False) for f in list_codex_sessions(d, n)],
             lambda d, n: scan_codex_tokens(d, n),
             tokens=True, group="cli"),
    _adapter("qoder", "Qoder CLI", "qoder_dir",
             lambda d, n: [dict(f, client="qoder") for f in list_qoder_sessions(d, n)],
             lambda d, n: scan_qoder_calls(d, n),
             tokens=False, note="Qoder CLI 本地日志不记录令牌数", group="cli"),
    _adapter("gemini", "Gemini (Antigravity)", "gemini_dir",
             lambda d, n: [dict(f, client="gemini") for f in list_gemini_sessions(d, n)],
             lambda d, n: scan_gemini_usage(d, n),
             tokens=False, group="ide"),
    _adapter("wb", "WorkBuddy", "wb_dir",
             lambda d, n: [dict(f, client="wb") for f in list_wb_sessions(d, n)],
             lambda d, n: scan_wb_usage(d, n),
             tokens=True, group="ide"),
    _adapter("qwen", "Qwen Code", "qwen_dir",
             lambda d, n: [dict(f, client="qwen") for f in list_qwen_sessions(d, n)],
             lambda d, n: scan_qwen_usage(d, n),
             tokens=False, note="本地仅保存会话元信息，无对话正文与令牌字段", group="cli"),
    _adapter("kimi", "Kimi", "kimi_dir",
             lambda d, n: [dict(f, client="kimi") for f in list_kimi_sessions(d, n)],
             lambda d, n: scan_kimi_usage(d, n),
             tokens=False, note="本地不保存会话记录（目录内只有可执行文件）", group="cli"),
]
ADAPTER_BY_ID = {a["id"]: a for a in ADAPTERS}


def adapter_dirs(handler_cls):
    """当前生效的各适配器目录（从 Handler 类属性取，设置改动即时反映）。"""
    return {a["id"]: (getattr(handler_cls, a["attr"], "") or "") for a in ADAPTERS}


def _safe_list(adapter, d, limit=80):
    """调用适配器 lister，出错时记一条 stderr（便于排查），返回 (sessions, error)。

    这里不再静默吞掉异常：适配器签名不匹配之类的问题会现形，而不是伪装成「0 个会话」。
    """
    if not d:
        return [], ""
    try:
        return adapter["lister"](d, limit), ""
    except Exception as e:
        msg = "%s：%s" % (adapter["label"], e)
        sys.stderr.write("  [flow_serve] 适配器扫描失败 %s\n" % msg)
        return [], msg


def clients_view(handler_cls):
    """所有适配器的会话列表视图（/__flow_clients）。"""
    out = []
    for a in ADAPTERS:
        d = getattr(handler_cls, a["attr"], "") or ""
        sessions, err = _safe_list(a, d)
        out.append({"id": a["id"], "label": a["label"], "dir": d, "tokens": a["tokens"],
                    "note": a["note"], "group": a["group"], "error": err,
                    "available": bool(d and os.path.isdir(d)),
                    "sessions": sessions})
    return {"ok": True, "clients": out}


def agents_registry(handler_cls):
    """「已连接智能体」注册表视图：连接状态 + 对话画布统计。

    与 /__flow_clients 的区别：这里给的是分类导航用的汇总，不列具体会话文件，
    但会如实区分「已连接（有会话）/ 已连接（暂无会话）/ 未安装」三种状态。
    """
    items = []
    total_sessions = total_subs = 0
    for a in ADAPTERS:
        d = getattr(handler_cls, a["attr"], "") or ""
        exists = bool(d and os.path.isdir(d))
        sessions, err = _safe_list(a, d) if exists else ([], "")
        mains = [s for s in sessions if not s.get("sub")]
        subs = [s for s in sessions if s.get("sub")]
        last = max((s.get("mtime") or 0 for s in sessions), default=0)
        state = "connected" if mains else ("empty" if exists else "missing")
        total_sessions += len(mains)
        total_subs += len(subs)
        items.append({
            "id": a["id"], "label": a["label"], "group": a["group"], "dir": d,
            "tokens": a["tokens"], "note": a["note"], "state": state,
            "exists": exists, "sessions": len(mains), "subagents": len(subs),
            "lastMtime": last, "error": err,
            "lastActive": datetime.fromtimestamp(last).strftime("%Y-%m-%d %H:%M") if last else "",
        })
    items.sort(key=lambda x: (x["state"] != "connected", -x["lastMtime"]))
    return {"ok": True,
            "summary": {"known": len(ADAPTERS),
                        "connected": sum(1 for i in items if i["state"] == "connected"),
                        "empty": sum(1 for i in items if i["state"] == "empty"),
                        "missing": sum(1 for i in items if i["state"] == "missing"),
                        "sessions": total_sessions, "subagents": total_subs},
            "clients": items}


def client_usage_all(handler_cls):
    """多智能体用量聚合（遍历注册表）+ 20s 缓存。"""
    dirs = adapter_dirs(handler_cls)
    key = tuple(sorted(dirs.items()))
    now = time.time()
    if _USAGE_CACHE["v"] is not None and _USAGE_CACHE["key"] == key \
            and (now - _USAGE_CACHE["t"]) < CLIENT_USAGE_TTL:
        return _USAGE_CACHE["v"]
    clients = {}
    for a in ADAPTERS:
        d = dirs.get(a["id"]) or ""
        if not (d and os.path.isdir(d)) or a["usage"] is None:
            clients[a["id"]] = _empty_client(a["label"], a["tokens"], a["note"])
            continue
        try:
            v = a["usage"](d, 80)
            v.pop("badLines", None)
        except Exception as e:
            clients[a["id"]] = _empty_client(a["label"], a["tokens"], "扫描失败：%s" % e)
            continue
        if not isinstance(v, dict):
            clients[a["id"]] = _empty_client(a["label"], a["tokens"], a["note"])
            continue
        v.setdefault("label", a["label"])
        clients[a["id"]] = v
    v = {"ok": True, "generated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "clients": clients}
    _USAGE_CACHE.update({"t": now, "key": key, "v": v})
    return v


def client_usage(rollout_dir, codex_dir, qoder_dir, gemini_dir=""):
    """[兼容保留] 三/四家客户端用量聚合的旧签名。

    新代码请用 client_usage_all(handler_cls)（遍历 ADAPTERS，自动包含后续新增的智能体）。
    这里仅为外部调用方保留旧接口，内部已不再使用。
    """
    dirs = {"rollout_dir": rollout_dir, "codex_dir": codex_dir,
            "qoder_dir": qoder_dir, "gemini_dir": gemini_dir}

    class _Stub:
        pass
    for a in ADAPTERS:
        setattr(_Stub, a["attr"], dirs.get(a["attr"], "") or "")
    return client_usage_all(_Stub)


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
            os.path.join(home, ".qoder-cn"),
            os.path.join(home, ".gemini", "antigravity"),
            os.path.join(home, ".workbuddy"),
            os.path.join(home, ".qwen"),
            os.path.join(home, ".kimi-work"))


SETTINGS_KEYS = ("usage", "rollout", "agents", "codex", "qoder", "gemini", "wb", "qwen", "kimi")
KEY_ATTR = {"usage": "usage_path", "rollout": "rollout_dir", "agents": "agents_dir",
            "codex": "codex_dir", "qoder": "qoder_dir", "gemini": "gemini_dir",
            "wb": "wb_dir", "qwen": "qwen_dir", "kimi": "kimi_dir"}


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


def settings_save(saved, prices=None):
    path = settings_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    obj = dict(saved)
    if prices is not None:
        if prices:
            obj["prices"] = prices
        else:
            obj.pop("prices", None)
    text = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix=".flow-settings-", dir=d)
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def prices_valid(pr):
    """校验模型单价表：{模型: {"in","out","cr"}}，值须为有限非负数（美元/百万 token）。"""
    out = {}
    if not isinstance(pr, dict):
        return out
    for k, v in pr.items():
        if len(out) >= PRICE_MAX_MODELS:
            break
        if not isinstance(k, str) or not k.strip() or len(k) > 128 or not isinstance(v, dict):
            continue
        row, okrow = {}, False
        for kk in ("in", "out", "cr"):
            x = v.get(kk)
            if isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and 0 <= x <= PRICE_MAX_VALUE:
                row[kk] = float(x)
                okrow = True
        if okrow:
            out[k.strip()] = row
    return out


def prices_load():
    try:
        with open(settings_file(), encoding="utf-8") as f:
            obj = json.load(f)
    except Exception:
        return {}
    if not isinstance(obj, dict):
        return {}
    return prices_valid(obj.get("prices"))


def wf_state_file():
    return os.path.join(os.path.expanduser("~"), ".zcode", "codex-manager", "wf-backup.json")


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
    gemini_dir = ""
    wb_dir = ""
    qwen_dir = ""
    kimi_dir = ""
    settings_saved = {}      # flow-settings.json 中已保存的覆盖值（内存副本）
    settings_cli = {}        # 启动参数显式指定的路径（优先级最高，设置不可覆盖）
    settings_default = {}    # 各键的出厂默认路径
    settings_prices = {}     # 模型单价表（估算费用，美元/百万 token）

    def watch_path(self):
        try:
            root = os.path.realpath(self.root)
            p = os.path.realpath(os.path.join(root, self.watch))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    # ---------- v0.27.6 路径解析 / 「正在改动中的文件」检测 ----------
    def allow_roots(self):
        """写回 / 扫描允许的根目录列表：--dir 优先，其余来自 --scan-dir（去重）。"""
        roots = []
        for d in [self.root] + list(getattr(self, "scan_dirs", []) or []):
            if not d:
                continue
            try:
                r = os.path.realpath(d)
            except Exception:
                continue
            if os.path.isdir(r) and r not in roots:
                roots.append(r)
        return roots

    def resolve_under_root(self, rel):
        """相对（相对第一个允许根）或绝对路径 → 绝对路径；不在任何允许根内时返回 None。"""
        if not isinstance(rel, str) or not rel.strip():
            return None
        roots = self.allow_roots()
        if not roots:
            return None
        try:
            raw = rel.replace("\\", "/")
            p = raw if os.path.isabs(raw) else os.path.join(roots[0], raw.lstrip("/"))
            p = os.path.realpath(p)
            for r in roots:
                try:
                    if os.path.commonpath([r, p]) == r and p != r:
                        return p
                except ValueError:
                    continue
            return None
        except Exception:
            return None

    def recent_files(self, within_min, limit):
        """允许根目录下最近 within_min 分钟内改动过的文件，按 mtime 倒序。

        用于编辑器工具栏的「正在改动中的文件」下拉：一键把画布连到那个文件上。
        跳过隐藏目录/依赖目录，只收源码与文档类扩展名。
        返回的 rel 优先相对第一个根；不在其下时给绝对路径（写回接口同样接受绝对路径）。
        """
        roots = self.allow_roots()
        if not roots:
            return []
        base = roots[0]
        now = time.time()
        within = max(1, int(within_min or 180)) * 60
        out = []
        scanned = 0
        seen = set()
        for root in roots:
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in RECENT_SKIP_DIRS]
                for fn in filenames:
                    if fn.startswith("."):
                        continue
                    if os.path.splitext(fn)[1].lower() not in RECENT_EXTS:
                        continue
                    scanned += 1
                    if scanned > RECENT_MAX_SCAN:
                        break
                    fp = os.path.join(dirpath, fn)
                    if fp in seen:
                        continue
                    seen.add(fp)
                    try:
                        st = os.stat(fp)
                    except OSError:
                        continue
                    age = now - st.st_mtime
                    if age > within:
                        continue
                    try:
                        rel = os.path.relpath(fp, base).replace("\\", "/")
                        if rel.startswith(".."):
                            rel = fp.replace("\\", "/")
                    except ValueError:
                        rel = fp.replace("\\", "/")
                    out.append({
                        "rel": rel,
                        "name": fn,
                        "ext": os.path.splitext(fn)[1].lower(),
                        "mtime": int(st.st_mtime * 1000),
                        "ageSec": int(age),
                        "size": st.st_size,
                    })
                if scanned > RECENT_MAX_SCAN:
                    break
        out.sort(key=lambda x: x["mtime"], reverse=True)
        return out[: max(1, min(int(limit or 40), 200))]

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

    def gemini_path(self, sid):
        """Gemini 会话 id（uuid）+ rel 正文相对路径 → 正文文件绝对路径；不合法或越界返回 None。"""
        return _gemini_session_dir(self.gemini_dir, sid)

    def gemini_content_path(self, sid, rel):
        """brain/<sid>/<rel> → 绝对路径；rel 段全部校验且结果须落在会话目录内。

        rel 缺省时自动定位标准正文（.system_generated/logs/transcript.jsonl 等），
        这样调用方无需知道内部相对路径即可取到正文。
        """
        sdir = _gemini_session_dir(self.gemini_dir, sid)
        if not sdir:
            return None
        if not isinstance(rel, str) or not rel:
            found = _gemini_transcript(sdir)
            fp = found[0] if isinstance(found, tuple) else found
            return fp if (fp and os.path.isfile(fp)) else None
        parts = rel.replace("\\", "/").split("/")
        if not parts or not all(DIRNAME_RE.match(p) for p in parts):
            return None
        try:
            p = os.path.realpath(os.path.join(sdir, *parts))
            if os.path.commonpath([sdir, p]) != sdir:
                return None
            return p
        except Exception:
            return None

    def qwen_path(self, rel):
        """<项目>/chats/<文件>.runtime.json → 绝对路径；不合法或越界返回 None。"""
        if not (self.qwen_dir and isinstance(rel, str)):
            return None
        parts = rel.replace("\\", "/").split("/")
        if len(parts) != 3 or parts[1] != "chats" or not parts[2].endswith(".json"):
            return None
        if not all(DIRNAME_RE.match(p) for p in parts):
            return None
        try:
            root = os.path.realpath(os.path.join(self.qwen_dir, "projects"))
            p = os.path.realpath(os.path.join(root, *parts))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def wb_path(self, rel):
        """<项目>/<会话>.jsonl → 绝对路径；不合法或越界返回 None。"""
        if not (self.wb_dir and isinstance(rel, str)):
            return None
        parts = rel.replace("\\", "/").split("/")
        if len(parts) != 2 or not parts[1].endswith(".jsonl"):
            return None
        if not all(DIRNAME_RE.match(p) for p in parts):
            return None
        try:
            root = os.path.realpath(os.path.join(self.wb_dir, "projects"))
            p = os.path.realpath(os.path.join(root, *parts))
            if os.path.commonpath([root, p]) != root:
                return None
            return p
        except Exception:
            return None

    def client_session_path(self, client, cid, rel=""):
        """按适配器 id 解析会话正文文件绝对路径（统一入口，防目录穿越）。

        zcode/codex/qoder 用 id 即可定位；gemini 一个会话是一个目录，需额外给正文相对路径 rel。
        """
        if client == "zcode":
            return self.rollout_path("model-io-sess_" + str(cid) + ".jsonl") if ID_RE.match(str(cid)) else None
        if client == "codex":
            return self.codex_path(cid)
        if client == "qoder":
            return self.qoder_path(cid)
        if client == "gemini":
            return self.gemini_content_path(cid, rel)
        if client == "wb":
            return self.wb_path(cid)
        if client == "qwen":
            return self.qwen_path(cid)
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
                "gemini": bool(self.gemini_dir and os.path.isdir(self.gemini_dir)),
                "wb": bool(self.wb_dir and os.path.isdir(self.wb_dir)),
                "qwen": bool(self.qwen_dir and os.path.isdir(self.qwen_dir)),
                "kimi": bool(self.kimi_dir and os.path.isdir(self.kimi_dir)),
                "clients": True,  # /__flow_clients 端点存在（多客户端会话列表）
                "registry": True, # /__flow_agents_registry 端点存在（已连接智能体分类）
                "settings": True,  # /__flow_settings 端点存在（数据来源目录设置）
                "wfstate": True,   # /__flow_wf_state 端点存在（工作流树自动备份/恢复）
                "recent": True,    # /__flow_recent_files 端点存在（正在改动中的文件检测）
                "writePath": True, # /__flow_write_path 端点存在（按相对路径写回，配「连接正在改动的文件」）
                "clientUsage": any(bool((getattr(self, a["attr"], "") or "") and os.path.isdir(getattr(self, a["attr"], "")))
                                   for a in ADAPTERS),
            })
            return
        if path == "/__flow_agents_registry":
            self.send_json(200, agents_registry(type(self)))
            return
        if path == "/__flow_settings":
            self.send_json(200, self.settings_view())
            return
        if path == "/__flow_wf_state":
            self.send_wf_state()
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
            self.send_json(200, clients_view(type(self)))
            return
        if path == "/__flow_client_file":
            qs = parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            client = (qs.get("client") or [""])[0]
            cid = (qs.get("id") or [""])[0]
            rel = (qs.get("rel") or [""])[0]
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
            fp = self.client_session_path(client, cid, rel)
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
            self.send_json(200, client_usage_all(type(self)))
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
        if path == "/__flow_recent_files":
            # v0.27.6：服务根目录下最近改动过的文件（编辑器「正在改动中的文件」下拉）
            qs = parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            try:
                within = int((qs.get("within") or ["180"])[0])
                limit = int((qs.get("limit") or ["40"])[0])
            except Exception:
                within, limit = 180, 40
            try:
                files = self.recent_files(within, limit)
            except Exception as e:
                self.send_json(500, {"ok": False, "error": "扫描失败：%s" % e})
                return
            self.send_json(200, {"ok": True, "root": self.root, "withinMin": within, "files": files})
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
        if path == "/__flow_wf_state":
            self.post_wf_state()
            return
        if path == "/__flow_write_path":
            # v0.27.6：按**相对路径**写回（配「🔗 连接正在改动的文件」下拉）；路径必须落在服务根目录内
            try:
                body = self.read_body()
                rel = body.get("path")
                text = body.get("text")
                if not isinstance(text, str):
                    raise ValueError("缺少 text 字段")
            except Exception as e:
                self.send_json(400, {"ok": False, "error": "请求体解析失败：%s" % e})
                return
            fp = self.resolve_under_root(rel)
            if not fp:
                self.send_json(400, {"ok": False, "error": "path 非法或不在服务根目录内"})
                return
            try:
                self.write_atomic(fp, text)
            except Exception as e:
                self.send_json(500, {"ok": False, "error": "写入失败：%s" % e})
                return
            self.send_json(200, {"ok": True, "path": rel, "bytes": len(text.encode("utf-8"))})
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
        """设置视图：saved（文件覆盖）/cli（启动参数锁定）/default/effective/exists + prices（模型单价）。"""
        effective = {k: getattr(self, KEY_ATTR[k]) for k in SETTINGS_KEYS}
        exists = {}
        for k in SETTINGS_KEYS:
            p = effective.get(k) or ""
            exists[k] = os.path.isfile(p) if k == "usage" else os.path.isdir(p)
        return {"ok": True, "file": settings_file(),
                "saved": dict(self.settings_saved), "cli": dict(self.settings_cli),
                "default": dict(self.settings_default), "effective": effective, "exists": exists,
                "prices": dict(self.settings_prices)}

    def post_settings(self):
        """保存数据来源目录与模型单价：路径键固定 5 个、值须为绝对路径字符串（空=清除覆盖）；
        单价为 {模型: {"in","out","cr"}} 有限非负数（空对象=清空）；CLI 锁定的键保持不变；
        未锁定的立即生效并原子落盘。"""
        try:
            body = self.read_body()
            paths = body.get("paths")
            if paths is None:
                paths = {}
            if not isinstance(paths, dict):
                raise ValueError("paths 字段类型错误")
            if "prices" in body and not isinstance(body.get("prices"), dict):
                raise ValueError("prices 字段类型错误")
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
        prices_new = prices_valid(body["prices"]) if "prices" in body else None
        try:
            settings_save(saved, prices_new if prices_new is not None else self.settings_prices)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "设置写入失败：%s" % e})
            return
        for k, v in applied.items():
            setattr(type(self), KEY_ATTR[k], v)  # 改类属性：后续所有请求立即用新路径
        type(self).settings_saved = saved
        if prices_new is not None:
            type(self).settings_prices = prices_new
        self.send_json(200, {"ok": True, "locked": locked, "view": self.settings_view()})

    def send_wf_state(self):
        """读工作流树备份：不存在/损坏时 exists=false（编辑器静默跳过，不影响正常使用）。"""
        fp = wf_state_file()
        try:
            mt = os.path.getmtime(fp)
        except OSError:
            self.send_json(200, {"ok": True, "exists": False, "tree": None})
            return
        try:
            with open(fp, encoding="utf-8") as f:
                tree = json.load(f)
        except Exception:
            self.send_json(200, {"ok": True, "exists": False, "tree": None, "error": "备份文件损坏"})
            return
        self.send_json(200, {"ok": True, "exists": True, "tree": tree, "mtime": int(mt),
                             "bytes": os.path.getsize(fp)})

    def post_wf_state(self):
        """写工作流树备份（编辑器防抖回传整树）：须为含 list 数组的对象且 8MB 以内，原子写。"""
        try:
            body = self.read_body()
            tree = body.get("tree")
            if not isinstance(tree, dict) or not isinstance(tree.get("list"), list):
                raise ValueError("缺少 tree.list 字段")
            if len(tree["list"]) > WF_STATE_MAX_CANVASES:
                raise ValueError("画布数量过多（>%d）" % WF_STATE_MAX_CANVASES)
            text = json.dumps(tree, ensure_ascii=False)
            if len(text.encode("utf-8")) > WF_STATE_MAX_BYTES:
                raise ValueError("备份过大（大于 8MB）")
        except Exception as e:
            self.send_json(400, {"ok": False, "error": "请求体解析失败：%s" % e})
            return
        fp = wf_state_file()
        try:
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            self.write_atomic(fp, text)
        except Exception as e:
            self.send_json(500, {"ok": False, "error": "备份写入失败：%s" % e})
            return
        self.send_json(200, {"ok": True, "bytes": len(text.encode("utf-8"))})

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
    ap.add_argument("--scan-dir", action="append", default=[], metavar="DIR",
                    help="v0.27.6 额外扫描目录（可重复）：也参与「正在改动中的文件」检测，"
                         "且允许把画布连到其中的文件（写回白名单 = --dir + 全部 --scan-dir）")
    ap.add_argument("--watch", default="flow-source.mmd", help="双向同步的目标文件（相对 --dir）")
    ap.add_argument("--port", type=int, default=8380, help="起始端口（被占用则依次 +1 重试）")
    ap.add_argument("--usage", default="", help="usage.jsonl 路径（默认 %%USERPROFILE%%\\.zcode\\codex-manager\\usage.jsonl）")
    ap.add_argument("--rollout", default="", help="ZCode rollout 目录（默认 %%USERPROFILE%%\\.zcode\\cli\\rollout，用于 token 统计与问答自动载入）")
    ap.add_argument("--agents", default="", help="ZCode 子智能体目录（默认 %%USERPROFILE%%\\.zcode\\cli\\agents，用于问答视图同步）")
    ap.add_argument("--skills", default="", help="技能草稿目录（默认 %%USERPROFILE%%\\.zcode\\codex-manager\\skills）")
    ap.add_argument("--skills-install", default="", help="技能安装目录（默认 <插件仓库>\\skills）")
    ap.add_argument("--codex", default="", help="Codex CLI 会话目录（默认 %%USERPROFILE%%\\.codex\\sessions）")
    ap.add_argument("--qoder", default="", help="Qoder CLI 数据目录（默认 %%USERPROFILE%%\\.qoder-cn）")
    ap.add_argument("--gemini", default="", help="Gemini/Antigravity 数据目录（默认 %%USERPROFILE%%\\.gemini\\antigravity）")
    ap.add_argument("--wb", default="", help="WorkBuddy 数据目录（默认 %%USERPROFILE%%\\.workbuddy）")
    ap.add_argument("--qwen", default="", help="Qwen Code 数据目录（默认 %%USERPROFILE%%\\.qwen）")
    ap.add_argument("--kimi", default="", help="Kimi 数据目录（默认 %%USERPROFILE%%\\.kimi-work）")
    ap.add_argument("--open", action="store_true", help="启动后自动用默认浏览器打开编辑器")
    a = ap.parse_args()

    root = os.path.realpath(a.dir)
    if not os.path.isdir(root):
        print("目录不存在：%s" % root, file=sys.stderr)
        sys.exit(2)
    (d_usage, d_rollout, d_agents, d_skills, d_skills_install,
     d_codex, d_qoder, d_gemini, d_wb, d_qwen, d_kimi) = default_paths()
    cli_paths = {k: v for k, v in (("usage", a.usage), ("rollout", a.rollout), ("agents", a.agents),
                                   ("codex", a.codex), ("qoder", a.qoder), ("gemini", a.gemini),
                                   ("wb", a.wb), ("qwen", a.qwen), ("kimi", a.kimi)) if v}
    defaults = {"usage": d_usage, "rollout": d_rollout, "agents": d_agents,
                "codex": d_codex, "qoder": d_qoder, "gemini": d_gemini,
                "wb": d_wb, "qwen": d_qwen, "kimi": d_kimi}
    saved = settings_load()
    Handler.root = root
    Handler.watch = a.watch
    # v0.27.6：额外扫描目录（参与「正在改动中的文件」检测，也在写回白名单里）
    Handler.scan_dirs = [os.path.realpath(d) for d in (getattr(a, "scan_dir", None) or []) if d and os.path.isdir(d)]
    Handler.settings_cli = cli_paths
    Handler.settings_default = defaults
    Handler.settings_saved = saved
    Handler.settings_prices = prices_load()
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
    print("  --- 已注册智能体 %d 个 ---" % len(ADAPTERS))
    for ad in ADAPTERS:
        d = getattr(Handler, ad["attr"], "") or ""
        ok = bool(d and os.path.isdir(d))
        print("  [%s] %-22s %s（%s）" % ("已连接" if ok else "未发现", ad["label"], d, "存在" if ok else "缺失"))
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
