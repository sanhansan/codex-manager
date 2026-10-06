---
description: 统计各插件/技能/MCP 的使用量并一键导出 Excel 表格
argument-hint: "[可选：统计最近 N 天，如 7；不填则统计全部]"
---

用户要查看插件使用量报表。数据由 codex-manager 的钩子自动记录在用量日志里。请严格按以下步骤执行：

1. **读数据**：数据文件是 `%USERPROFILE%\.zcode\codex-manager\usage.jsonl`（即 `C:\Users\<用户名>\.zcode\codex-manager\usage.jsonl`）。若文件不存在或为空：如实告知"暂无使用记录，安装 codex-manager 后钩子会随使用自动积累数据"，不要编造数据，流程到此结束。
2. **运行脚本**：把下面的脚本原样保存为工作区临时文件 `_codex_usage_xlsx.py`，然后执行
   `python _codex_usage_xlsx.py "<usage.jsonl 的完整路径>" "<输出.xlsx 的完整路径>" [天数]`
   - 天数取本命令的参数（若有）；输出文件名用 `codex-usage-YYYYMMDD-HHMMSS.xlsx`，保存到当前工作区根目录。
   - 脚本会在 stdout 打印 Markdown 明细表，并在失败时以非 0 退出。
3. **展示结果**：把脚本打印的 Markdown 表格完整呈现在回复中，并给出 Excel 文件的完整路径。
4. **收尾**：删除临时脚本 `_codex_usage_xlsx.py`。补充一句说明：表格只包含安装 codex-manager 之后的使用记录。
5. 若脚本报 `ModuleNotFoundError: openpyxl`：改为把同样内容写成 CSV（UTF-8 带 BOM，文件名 `codex-usage-YYYYMMDD-HHMMSS.csv`，方便 Excel 直接打开），并提示用户可 `pip install openpyxl` 后重试以获得带样式的 Excel。

```python
# 用法: python _codex_usage_xlsx.py <usage.jsonl> <output.xlsx> [天数]
# 读取 codex-manager 用量日志，聚合后生成 Excel，并在 stdout 打印 Markdown 表格。
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 3:
        print("用法: python _codex_usage_xlsx.py <usage.jsonl> <output.xlsx> [天数]")
        sys.exit(2)
    src, out = sys.argv[1], sys.argv[2]
    days = int(sys.argv[3]) if len(sys.argv) > 3 else None

    rows = []
    with open(src, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                pass

    now = datetime.now().astimezone()

    def parse_ts(s):
        # 日志里的 ts 是 UTC（ISO 8601，带 Z），统一转本地时区后再比较和展示。
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone()
        except Exception:
            return None

    def in_range(rec):
        if days is None:
            return True
        ts = parse_ts(rec.get("ts", ""))
        return ts is not None and ts >= now - timedelta(days=days)

    rows = [r for r in rows if in_range(r)]
    if not rows:
        print("EMPTY")
        return

    kind_cn = {"skill": "技能", "mcp": "MCP", "session": "会话"}

    def fmt_ts(s):
        ts = parse_ts(s)
        return ts.strftime("%Y-%m-%d %H:%M:%S") if ts else ""

    # 明细表只统计技能/MCP 调用；会话记录只计入概览，避免干扰"哪个插件用得多"。
    agg = {}
    for r in rows:
        if r.get("kind") not in ("skill", "mcp"):
            continue
        key = (r.get("kind", "?"), r.get("plugin", "(未知)"), r.get("name", "(未知)"))
        a = agg.setdefault(key, {"count": 0, "sessions": set(), "last": ""})
        a["count"] += 1
        if r.get("session"):
            a["sessions"].add(r["session"])
        if r.get("ts", "") > a["last"]:
            a["last"] = r.get("ts", "")
    detail = sorted(
        ((k, a["count"], len(a["sessions"]), a["last"]) for k, a in agg.items()),
        key=lambda x: -x[1],
    )
    kind_total = defaultdict(int)
    session_ids = set()
    for r in rows:
        kind_total[r.get("kind", "?")] += 1
        if r.get("session"):
            session_ids.add(r["session"])

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "使用明细"
    headers = ["插件/来源", "技能/工具", "类型", "调用次数", "涉及会话数", "最近使用"]
    ws.append(headers)
    fill = PatternFill("solid", fgColor="4472C4")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = fill
        c.alignment = Alignment(horizontal="center")
    for (kind, plugin, name), count, sess, last in detail:
        ws.append([plugin, name, kind_cn.get(kind, kind), count, sess, fmt_ts(last)])
    for i, w in enumerate([22, 30, 10, 10, 12, 20], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    ov = wb.create_sheet("概览")
    ov.append(["指标", "数值"])
    for c in ov[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = fill
    scope = f"最近 {days} 天" if days else "全部记录"
    ov.append(["统计范围", scope])
    ov.append(["生成时间", now.strftime("%Y-%m-%d %H:%M:%S")])
    ov.append(["记录条数", len(rows)])
    ov.append(["会话数", len(session_ids)])
    for k in ("skill", "mcp", "session"):
        ov.append([f"{kind_cn.get(k, k)}记录数", kind_total.get(k, 0)])
    ov.column_dimensions["A"].width = 16
    ov.column_dimensions["B"].width = 24
    wb.save(out)

    print(f"统计范围：{scope}；共 {len(rows)} 条记录、{len(session_ids)} 个会话。")
    print()
    if not detail:
        print("统计范围内没有技能/MCP 调用记录（可能只有会话记录），明细表为空。")
    else:
        print("| 插件/来源 | 技能/工具 | 类型 | 调用次数 | 会话数 | 最近使用（本地时间） |")
        print("| --- | --- | --- | ---: | ---: | --- |")
        for (kind, plugin, name), count, sess, last in detail:
            print(f"| {plugin} | {name} | {kind_cn.get(kind, kind)} | {count} | {sess} | {fmt_ts(last)} |")


main()
```
