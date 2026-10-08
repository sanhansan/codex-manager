// codex-manager 编辑器 CORE 回归测试
// 运行：node tests/run-tests.mjs（在插件目录下执行）
// CORE 来自 assets/flow-editor.html 的 __CORE_START__..__CORE_END__ 区段，
// 由 prepare.mjs 抽取为 core.extracted.mjs —— 改了编辑器后先跑 prepare 再跑本测试。
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "..", "assets", "flow-editor.html");

// 每次运行都从 flow-editor.html 重新抽取，保证测的是真实源码
const html = readFileSync(htmlPath, "utf8");
const m = html.match(/\/\/__CORE_START__([\s\S]*?)\/\/__CORE_END__/);
if (!m) { console.error("FAIL: flow-editor.html 中找不到 __CORE_START__/__CORE_END__"); process.exit(1); }
const corePath = join(here, "core.extracted.mjs");
writeFileSync(corePath, m[1] + "\nexport { parseMermaid, toMermaid, graphToJSON, jsonToGraph, graphToMarkdown, markdownToGraph, guessKind, aggregateUsage, skillSummary, pluginUsageRows, habitCandidates, ctlLayout, autoLayout, findCycle, validateGraph, newNodeId, sizeNode, upsertNode, splitLabel, joinLabel, flowTemplate, topoOrder, edgeMeta, parseUsageRecords, traceQuery, cleanLabel, fitText, extractKeywords, parseQaTurns, parseCodexTurns, parseQoderTurns, parseWbTurns, parseGeminiTurns, parseQwenTurns, parseAnyTurns, keyPoints, highlightSummary, flowFromQa, parseAgentRecords, qaFilter, qaLabel, suggestSlug, skillDraft, keywordDigest, promptSummary, skillDraftFromPrompts, fmtWfWhen, taskCanvasName, wfTree, isQaContinuation, fmtDurMs, wfDurOfTurns, subNodeLabel, wfTreeParse, wfMergeEntries, priceFor, costOfModel, fmtCost, projectOf, projectKeyOf, groupByProject, agentsInProject, projectCollaboration, nnSquarify, ntLinePx, ntVisibleChars, ntTokenize, ntHash, ntFocusSetIn, ntWrapText, ntCardRows, qaTextLines, looksLikeCode, segHitsRect, polylineFree, routeOrtho, ntPackRows, ntRoleOf, ntRoleColor, nnStats, ntShadeOf, ntSpanOf };");

const core = await import(pathToFileURL(corePath).href);
  const {
  parseMermaid, toMermaid, graphToJSON, jsonToGraph,
  graphToMarkdown, markdownToGraph,
  guessKind, aggregateUsage, skillSummary, pluginUsageRows, habitCandidates,
  ctlLayout, autoLayout, findCycle, validateGraph, newNodeId,
  splitLabel, joinLabel, flowTemplate, topoOrder, edgeMeta,
  parseUsageRecords, traceQuery, cleanLabel, fitText,
  extractKeywords, parseQaTurns, parseAgentRecords, qaFilter, qaLabel,
  parseCodexTurns, parseQoderTurns, parseWbTurns, parseGeminiTurns, parseQwenTurns, parseAnyTurns, keyPoints, highlightSummary, flowFromQa,
  suggestSlug, skillDraft, keywordDigest, promptSummary, skillDraftFromPrompts,
  fmtWfWhen, taskCanvasName, wfTree, isQaContinuation,
  fmtDurMs, wfDurOfTurns, subNodeLabel, wfTreeParse, wfMergeEntries,
  priceFor, costOfModel, fmtCost,
  projectOf, projectKeyOf, groupByProject, agentsInProject, projectCollaboration,
  nnSquarify, ntLinePx, ntVisibleChars, ntTokenize, ntHash, ntFocusSetIn, ntWrapText,
  ntCardRows, qaTextLines, looksLikeCode, segHitsRect, polylineFree, routeOrtho, ntPackRows,
  ntRoleOf, ntRoleColor, nnStats, ntShadeOf, ntSpanOf,
} = core;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("ok  -", name); pass++; }
  catch (e) { console.error("FAIL-", name, "::", e.message); fail++; }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "eq") + "：got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function okTest(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
function ok(v, msg) { if (!v) throw new Error(msg || "断言为假"); }

// ---------- mermaid 解析与往返 ----------
t("mermaid 往返：parse→toMermaid→parse 稳定", () => {
  const src = "flowchart TD\n  n1[开始] --> n2{判断}\n  n2 -->|是| n3[处理]\n  n2 -.->|否| n1";
  const g1 = parseMermaid(src);
  eq(g1.nodes.length, 3);
  eq(g1.edges.length, 3);
  const g2 = parseMermaid(toMermaid(g1));
  eq(g2.nodes.map(n => n.id), g1.nodes.map(n => n.id));
  eq(g2.nodes.map(n => n.label), g1.nodes.map(n => n.label));
  eq(g2.edges.map(e => [e.from, e.to]), g1.edges.map(e => [e.from, e.to]));
});

t("子流程节点往返：▸→流程名 保留", () => {
  const g1 = parseMermaid("flowchart TD\n  a[▸→登录流程] --> b[完成]");
  eq(g1.nodes[0].subflow, "登录流程");
  const g2 = parseMermaid(toMermaid(g1));
  eq(g2.nodes[0].subflow, "登录流程");
});

t("逻辑门：⚙NOT 后缀随 mermaid 携带", () => {
  const g1 = parseMermaid("flowchart TD\n  a[⚙NOT] --> b[结果]");
  eq(g1.nodes[0].gate, "NOT");
  const g2 = parseMermaid(toMermaid(g1));
  eq(g2.nodes[0].gate, "NOT");
});

// ---------- JSON / Markdown 三向同步 ----------
t("graphToJSON→jsonToGraph 保留结构与坐标", () => {
  const g1 = parseMermaid("flowchart TD\n  a[甲] --> b[乙]\n  b --> c{丙}");
  g1.nodes[0].x = 111; g1.nodes[0].y = 222;
  const g2 = jsonToGraph(graphToJSON(g1));
  eq(g2.nodes.length, 3);
  eq([g2.nodes[0].x, g2.nodes[0].y], [111, 222]);
  eq(g2.nodes[2].shape, "diamond");
});

t("graphToMarkdown→markdownToGraph 往返", () => {
  const g1 = parseMermaid("flowchart TD\n  a[开始] --> b[结束]");
  const g2 = markdownToGraph(graphToMarkdown(g1));
  eq(g2.nodes.map(n => n.label), ["开始", "结束"]);
  eq(g2.edges.length, 1);
});

// ---------- 校验与环检测 ----------
t("findCycle 能检出环", () => {
  const g = parseMermaid("flowchart TD\n  a --> b\n  b --> c\n  c --> a");
  ok(findCycle(g), "应检出 a→b→c→a");
});
t("无环图 findCycle 返回空", () => {
  const g = parseMermaid("flowchart TD\n  a --> b\n  a --> c");
  eq(findCycle(g), null);
});

// ---------- 布局 ----------
t("autoLayout TB：按层分行", () => {
  const g = parseMermaid("flowchart TD\n  a --> b\n  a --> c\n  b --> d\n  c --> d");
  autoLayout(g, "TD");
  ok(g.nodes[0].y < g.nodes[3].y, "起点应在终点上方");
});
t("autoLayout 蛇形：>8 层线性链且每层 1 节点才启用", () => {
  // TB 布局下每层占一行：8 层链（8 节点）= 8 行（不折行）
  let src8 = "flowchart TD\n";
  for (let i = 1; i <= 7; i++) src8 += `  m${i} --> m${i + 1}\n`;
  const g8 = parseMermaid(src8);
  autoLayout(g8, "TD");
  eq(new Set(g8.nodes.map(n => n.y)).size, 8, "8 层链应各占一行不折行");
  // 10 层链（10 节点）折成 2 行（每行 6 层往返）
  let src = "flowchart TD\n";
  for (let i = 1; i <= 9; i++) src += `  n${i} --> n${i + 1}\n`;
  const g = parseMermaid(src);
  autoLayout(g, "TD");
  eq(new Set(g.nodes.map(n => n.y)).size, 2, "10 层链应折成 2 行");
});

// ---------- 用量统计（习惯页 CORE） ----------
t("guessKind 三分类", () => {
  eq(guessKind('{"a":1}'), "json");
  eq(guessKind("# 标题\n甲 → 乙"), "md");
  eq(guessKind("flowchart TD\n a --> b"), "mermaid");
});

t("aggregateUsage：坏行跳过、分类与聚合正确", () => {
  const lines = [
    JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "skill", plugin: "p1", name: "s1", session: "sessA", cwd: "C:\\w" }),
    JSON.stringify({ ts: "2026-10-06T10:00:00Z", kind: "skill", plugin: "p1", name: "s1", session: "sessA" }),
    JSON.stringify({ ts: "2026-10-06T11:00:00Z", kind: "mcp", plugin: "p2", name: "t1", session: "sessB" }),
    "not json",
    "",
  ].join("\n");
  const agg = aggregateUsage(lines);
  eq(agg.total, 3);
  eq(agg.sessions, 2);
  eq(agg.kinds.skill, 2);
  eq(agg.kinds.mcp, 1);
  eq(agg.byName["p1 · s1"], 2);
  ok(agg.nameLast["p1 · s1"], "应记录最近使用时间");
});

t("skillSummary：排序、占比与结论文案", () => {
  const agg = aggregateUsage([
    JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "skill", plugin: "a", name: "x", session: "s" }),
    JSON.stringify({ ts: "2026-10-06T09:01:00Z", kind: "skill", plugin: "a", name: "x", session: "s" }),
    JSON.stringify({ ts: "2026-10-06T09:02:00Z", kind: "mcp", plugin: "b", name: "y", session: "s" }),
  ].join("\n"));
  const s = skillSummary(agg);
  eq(s.skills.length, 1);
  eq(s.mcps.length, 1);
  eq(s.rows[0].name, "x");
  eq(s.rows[0].pct, 67);
  ok(s.text.includes("「x」"), "结论应点名最常用技能");
});

t("pluginUsageRows：按插件聚合，含技能/MCP 拆分与主要工具", () => {
  const agg = aggregateUsage([
    JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "skill", plugin: "a", name: "x", session: "s" }),
    JSON.stringify({ ts: "2026-10-06T10:00:00Z", kind: "skill", plugin: "a", name: "x", session: "s" }),
    JSON.stringify({ ts: "2026-10-06T11:00:00Z", kind: "mcp", plugin: "a", name: "m1", session: "s" }),
    JSON.stringify({ ts: "2026-10-06T12:00:00Z", kind: "mcp", plugin: "b", name: "y", session: "s" }),
  ].join("\n"));
  const rows = pluginUsageRows(agg);
  eq(rows.length, 2);
  eq(rows[0].plugin, "a");
  eq(rows[0].count, 3);
  eq(rows[0].skill, 2);
  eq(rows[0].mcp, 1);
  eq(rows[0].pct, 75);
  ok(rows[0].names.includes("x×2"), "主要工具应带次数");
  ok(rows[1].last > rows[0].last, "b 的最后一次（12:00Z）应晚于 a 的最后一次（11:00Z）");
});

t("habitCandidates：产出 ≤5 条且带证据", () => {
  const agg = aggregateUsage([
    JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "skill", plugin: "a", name: "x", session: "s", cwd: "C:\\one" }),
    JSON.stringify({ ts: "2026-10-06T10:00:00Z", kind: "mcp", plugin: "b", name: "y", session: "s2", cwd: "C:\\two" }),
  ].join("\n"));
  const c = habitCandidates(agg);
  ok(c.length >= 1 && c.length <= 5);
  c.forEach(x => { ok(x.title && x.evidence && x.suggestion, "每条候选需 title/evidence/suggestion"); });
});

// ---------- Skill 工坊（习惯候选 → SKILL.md 草稿） ----------
const draftAgg = aggregateUsage([
  JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "mcp", plugin: "browser-use", name: "control-browser", session: "s", cwd: "C:\\one" }),
  JSON.stringify({ ts: "2026-10-06T09:10:00Z", kind: "mcp", plugin: "browser-use", name: "control-browser", session: "s", cwd: "C:\\one" }),
  JSON.stringify({ ts: "2026-10-06T10:00:00Z", kind: "skill", plugin: "codex-manager", name: "codex-manager", session: "s2", cwd: "C:\\two" }),
].join("\n"));

t("suggestSlug：从高频工具名生成 slug，无 ASCII 名时退化到日期", () => {
  eq(suggestSlug(draftAgg, "2026-10-07"), "habit-control-browser");
  const zhAgg = aggregateUsage([JSON.stringify({ kind: "mcp", plugin: "p", name: "中文工具", session: "s" })].join("\n"));
  eq(suggestSlug(zhAgg, "2026-10-07"), "habit-20261007");
});

t("skillDraft：中文草稿含双关键词 frontmatter、章节与数据依据", () => {
  const md = skillDraft("habit-x", draftAgg, habitCandidates(draftAgg), "zh", "2026-10-07");
  ok(md.startsWith("---\nname: habit-x\n"), "应以 frontmatter 开头：" + md.slice(0, 40));
  ok(md.includes("description:") && md.includes("Use when the user repeatedly"), "description 应英中双关键词");
  ["## 何时使用", "## 推荐步骤", "## 验收点", "## 数据依据（usage.jsonl 汇总）"].forEach(sec => ok(md.includes(sec), "缺少章节 " + sec));
  ok(md.includes("2026-10-07") && md.includes("总记录 3 条"), "应含生成日期与记录数");
  ok(md.includes("browser-use · control-browser ×2"), "应含高频清单：" + md.split("\n").slice(-4).join(" | "));
});

t("skillDraft：英文模式输出英文正文，仍是双关键词 description", () => {
  const md = skillDraft("habit-x", draftAgg, habitCandidates(draftAgg, "en"), "en", "2026-10-07");
  ["## When to use", "## Suggested steps", "## Acceptance", "## Evidence (usage.jsonl)"].forEach(sec => ok(md.includes(sec), "缺少章节 " + sec));
  ok(md.includes("当用户反复需要"), "英文草稿的 description 也应含中文关键词");
});
// ---------- 总控布局 ----------
t("ctlLayout：按引用分层，子流程在调用者右侧", () => {
  const list = [
    { name: "主流程", subs: ["登录"] },
    { name: "登录", subs: [] },
  ];
  const r = ctlLayout(list);
  ok(r.nodes["登录"].col > r.nodes["主流程"].col, "被引用者应在更右列");
  eq(r.edges.length, 1);
});
t("ctlLayout：自引用与未知引用不产生边", () => {
  const list = [
    { name: "A", subs: ["A", "不存在"] },
    { name: "B", subs: [] },
  ];
  const r = ctlLayout(list);
  eq(r.edges.length, 0);
});
t("ctlLayout：引用环不致死循环", () => {
  const list = [
    { name: "A", subs: ["B"] },
    { name: "B", subs: ["A"] },
  ];
  const r = ctlLayout(list); // guard 兜底，应正常返回
  ok(r.nodes.A && r.nodes.B);
});

// ---------- 其他 ----------
t("newNodeId 从 1 起找空位", () => {
  const g = parseMermaid("flowchart TD\n  n1 --> n2");
  eq(newNodeId(g), "n3");
});
t("validateGraph：NOT 门多输入报错", () => {
  const g = parseMermaid("flowchart TD\n  a --> n[⚙NOT]\n  c --> n\n  n --> b");
  const errs = validateGraph(g, []);
  ok(errs.some(e => String(e.msg || e).includes("NOT")), "NOT 多输入应报错");
});

// ---------- 节点类型（◈ 后缀） ----------
t("splitLabel/joinLabel：◈类型 与 ⚙/▸→ 共存", () => {
  const p = splitLabel("混球+字幕 ▸→下游流程 ◈agent");
  eq(p.label, "混球+字幕");
  eq(p.subflow, "下游流程");
  eq(p.kind, "agent");
  eq(joinLabel({ label:"混球+字幕", gate:"IF", subflow:"下游流程", kind:"map" }), "混球+字幕 ⚙IF ▸→下游流程 ◈map");
});
t("mermaid 往返：◈类型 后缀保留", () => {
  const g1 = parseMermaid("flowchart TD\n  a[输入 ◈input] --> b[处理 ◈agent]\n  b --> c{是否通过? ◈cond}\n  c -->|是| d[输出 ◈output]");
  eq(g1.nodes.map(n => n.kind), ["input", "agent", "cond", "output"]);
  const g2 = parseMermaid(toMermaid(g1));
  eq(g2.nodes.map(n => n.kind), ["input", "agent", "cond", "output"]);
  eq(g2.nodes.map(n => n.label), g1.nodes.map(n => n.label));
});
t("JSON 往返：kind 与 doc 保留", () => {
  const g1 = parseMermaid("flowchart TD\n  a[输入 ◈input] --> b[输出 ◈output]");
  g1.nodes[0].doc = "负责读取参数";
  const g2 = jsonToGraph(graphToJSON(g1));
  eq(g2.nodes.map(n => n.kind), ["input", "output"]);
  eq(g2.nodes[0].doc, "负责读取参数");
});
t("Markdown 往返：类型、执行顺序与节点说明", () => {
  const g1 = parseMermaid("flowchart TD\n  a[开始 ◈input] --> b[结束 ◈output]");
  g1.nodes[1].doc = "第一步\n读入参数";
  const md = graphToMarkdown(g1);
  ok(md.includes("◈input") && md.includes("## 执行顺序") && md.includes("## 节点说明"), "MD 应含类型/执行顺序/节点说明");
  const g2 = markdownToGraph(md);
  eq(g2.nodes.map(n => n.kind), ["input", "output"]);
  eq(g2.nodes[1].doc, "第一步\n读入参数");
});

// ---------- 流程框架模板与校验 v2 ----------
t("flowTemplate：骨架完整且校验无 error 级问题", () => {
  const tg = flowTemplate("测试框架");
  eq(tg.nodes.length, 7);
  eq(tg.edges.length, 7);
  ok(tg.nodes.some(n => n.kind === "input") && tg.nodes.some(n => n.kind === "output"), "应含输入与输出节点");
  ok(tg.nodes.some(n => n.kind === "cond") && tg.nodes.some(n => n.kind === "merge"), "应含条件与合并节点");
  const errs = validateGraph(tg, ["测试框架"]);
  ok(!errs.some(e => e.level === "error"), "模板不应有 error 级校验问题：" + JSON.stringify(errs));
});
t("validateGraph：类型规则（输入入边 / 条件分支 / 缺输入输出）", () => {
  const g1 = parseMermaid("flowchart TD\n  a[处理 ◈agent] --> b[输入 ◈input]");
  ok(validateGraph(g1, []).some(i => i.msg.includes("不应有输入连线")), "输入节点有入边应告警");
  const g2 = parseMermaid("flowchart TD\n  a[输入 ◈input] --> c{条件 ◈cond}\n  c -->|是| x[ ◈agent]\n  c -->|否| y[ ◈agent]\n  c -->|异常| z[ ◈agent]");
  ok(validateGraph(g2, []).some(i => i.level === "error" && i.msg.includes("最多 2 个分支")), "条件 3 分支应报错");
  const g3 = parseMermaid("flowchart TD\n  a[处理 ◈agent] --> b[处理 ◈agent]");
  const iss = validateGraph(g3, []);
  ok(iss.some(i => i.msg.includes("缺少「输入」")) && iss.some(i => i.msg.includes("缺少「输出」")), "缺输入/输出节点应告警");
});

// ---------- 拓扑排序与连线元数据 ----------
t("topoOrder：无环返回顺序、有环返回 null", () => {
  const g1 = parseMermaid("flowchart TD\n  a --> b\n  a --> c\n  b --> d\n  c --> d");
  const o = topoOrder(g1);
  eq(o[0], "a");
  eq(o[3], "d");
  const g2 = parseMermaid("flowchart TD\n  a --> b\n  b --> a");
  eq(topoOrder(g2), null);
});
t("edgeMeta：平行边分道与反馈边识别", () => {
  const g1 = parseMermaid("flowchart TD\n  a --> b\n  b --> a");
  const m1 = edgeMeta(g1);
  eq(m1[0].laneCnt, 2, "a↔b 应视为同一组平行边");
  eq(m1[0].laneIdx, 0);
  eq(m1[1].laneIdx, 1);
  eq(m1[1].feedback, true, "b→a 应识别为反馈边");
  const g2 = parseMermaid("flowchart TD\n  a --> b\n  a --> c");
  const m2 = edgeMeta(g2);
  ok(m2.every(m => m.laneCnt === 1 && !m.feedback), "普通分叉无边道与反馈");
});

// ---------- 轨迹查询 ----------
t("parseUsageRecords/traceQuery：坏行跳过、过滤与时间倒序", () => {
  const lines = [
    JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "skill", plugin: "p1", name: "s1", session: "sessA", cwd: "C:\\w" }),
    "not json",
    JSON.stringify({ ts: "2026-10-06T11:00:00Z", kind: "mcp", plugin: "p2", name: "t1", session: "sessB" }),
    JSON.stringify({ ts: "2026-10-06T10:00:00Z", kind: "skill", plugin: "p1", name: "s2", session: "sessA", cwd: "C:\\deep" }),
  ].join("\n");
  const recs = parseUsageRecords(lines);
  eq(recs.length, 3, "坏行应跳过");
  eq(traceQuery(recs, { kind: "skill" }).length, 2);
  eq(traceQuery(recs, { kw: "deep" })[0].name, "s2", "关键字应命中 cwd");
  eq(traceQuery(recs, { session: "sessB" }).length, 1);
  const all = traceQuery(recs, {});
  ok(all[0].ts >= all[all.length - 1].ts, "应按时间倒序");
});

// ---------- 标签乱码清洗（浏览器打开图框乱码） ----------
t("乱码清洗：包裹引号与字面 \\n", () => {
  eq(cleanLabel('""需求: # Files mentioned by the user...""'), "需求: # Files mentioned by the user...");
  eq(cleanLabel('"引号标题"'), "引号标题");
  const g = parseMermaid('flowchart TD\n  P0[""需求: # Files mentioned by the user...""]\n  S1["exec ×44\\nconst hits = ALL_TOOLS.filter..."]\n  P0 --> S1');
  const p0 = g.nodes.find(n => n.id === "P0");
  const s1 = g.nodes.find(n => n.id === "S1");
  eq(p0.label, "需求: # Files mentioned by the user...");
  eq(s1.label, "exec ×44 const hits = ALL_TOOLS.filter...");
  const g2 = parseMermaid('flowchart TD\n  ENO(["产出"])\n  ENO --> OK["完成"]');
  eq(g2.nodes.find(n => n.id === "ENO").label, "产出", "stadium (\\\"\\\"\\]) 形态标签应剥干净");
  eq(g2.nodes.find(n => n.id === "ENO").shape, "round");
});
t("fitText：超宽标签截断加省略号", () => {
  eq(fitText("短标签", 100), "短标签");
  const t1 = fitText("甲".repeat(30), 100);
  ok(t1.endsWith("…") && t1.length <= 10, "长标签应截断：" + t1);
});

// ---------- 问答视图（总智能体 rollout Q&A / 子智能体记录 / 关键词） ----------
t("extractKeywords：中文去停用词、取 top-N", () => {
  const kws = extractKeywords("帮我把流程图编辑器加上问答视图，问答视图每项可以展开看关键词。流程图编辑器很好用", 5);
  eq(kws.length, 5);
  ok(kws.includes("流程") || kws.includes("编辑") || kws.includes("问答"), "应含内容词：" + kws.join(","));
  ok(!kws.includes("的了") && !kws.includes("可以") && !kws.includes("就是"), "停用词不应入选：" + kws.join(","));
  const en = extractKeywords("flow editor canvas editor zoom editor", 2);
  eq(en[0], "editor");
});
t("parseQaTurns：full+tail 拼接、系统消息跳过、工具收集", () => {
  const fullLine = JSON.stringify({
    sessionId: "sess_X", querySource: "main_turn", startedAt: "2026-10-07T01:00:00Z",
    request: { messagesKind: "full", messageOffset: 0, messageCount: 5, messages: [
      { role: "user", content: "<system-reminder>注入内容</system-reminder>" },
      { role: "user", content: "帮我梳理流程图" },
      { role: "assistant", content: [{ type: "text", text: "好的，开始梳理。" }], toolCalls: [{ id: "c1", name: "Read", input: {} }] },
      { role: "user", content: "再改成 LR" },
      { role: "assistant", content: [{ type: "text", text: "已改为 LR。" }] },
    ] }
  });
  const tailLine = JSON.stringify({
    sessionId: "sess_X", querySource: "main_turn", startedAt: "2026-10-07T01:01:00Z",
    request: { messagesKind: "tail", messageOffset: 3, messageCount: 2, messages: [
      { role: "user", content: "再改成 LR" },
      { role: "assistant", content: [{ type: "text", text: "已改为 LR。" }] },
    ] }
  });
  const r = parseQaTurns(fullLine + "\n" + tailLine);
  eq(r.session, "sess_X");
  eq(r.turns.length, 2, "系统注入不算提问，应只有 2 个回合");
  eq(r.turns[0].q, "帮我梳理流程图");
  ok(r.turns[0].a.includes("开始梳理"));
  eq(r.turns[0].tools, ["Read"]);
  eq(r.turns[1].q, "再改成 LR");
  eq(r.turns[1].a, "已改为 LR。");
  ok(r.turns[0].kw.length > 0, "每个回合应有关键词");
  ok(r.turns[0].ts > 0 && r.turns[1].ts >= r.turns[0].ts, "回合应带时间戳");
});
t("parseQaTurns：坏行跳过、空输入返回空", () => {
  eq(parseQaTurns("not json\n").turns.length, 0);
  eq(parseQaTurns("").session, "");
});
t("parseQaTurns：只有 tail/delta 分片窗口时，并集仍能找到更早的提问", () => {
  const w1 = JSON.stringify({
    sessionId: "sess_T", querySource: "main_turn", startedAt: "2026-10-07T02:00:00Z",
    request: { messagesKind: "tail", messageOffset: 3, messageCount: 5, messages: [
      { role: "user", content: "继续" },
      { role: "assistant", content: [{ type: "text", text: "收到，继续处理。" }] },
    ] }
  });
  const w2 = JSON.stringify({
    sessionId: "sess_T", querySource: "main_turn", startedAt: "2026-10-07T02:01:00Z",
    request: { messagesKind: "tail", messageOffset: 5, messageCount: 6, messages: [
      { role: "assistant", content: [{ type: "text", text: "补充说明。" }] },
    ] }
  });
  const r = parseQaTurns(w2 + "\n" + w1); // 文件顺序不保证窗口递增，并集应不受影响
  eq(r.turns.length, 1, "tail 分片窗口也应解析出提问");
  eq(r.turns[0].q, "继续");
  ok(r.turns[0].a.includes("继续处理"), "回答应来自同会话窗口");
});
t("parseAgentRecords：子智能体 metadata+output 映射、坏 JSON 跳过", () => {
  const meta = JSON.stringify({
    agentId: "agent_1", profileId: "general-purpose", description: "质量审查员",
    prompt: "你是质量审查员，审查流程", status: "completed",
    totalTokens: 20864, totalDurationMs: 176107,
    parentSessionId: "sess_P", createdAt: "2026-10-06T09:36:16.481Z",
  });
  const recs = parseAgentRecords([
    { metaText: meta, outputText: "发现列表：市场同步未逐文件校验" },
    { metaText: "not json", outputText: "" },
    { metaText: "{}", outputText: "" },
  ]);
  eq(recs.length, 1);
  eq(recs[0].profile, "general-purpose");
  eq(recs[0].q, "你是质量审查员，审查流程");
  ok(recs[0].a.includes("市场同步"));
  eq(recs[0].status, "completed");
  eq(recs[0].tokens, 20864);
  eq(recs[0].parentSession, "sess_P");
  ok(recs[0].ts > 0);
  ok(recs[0].kw.length > 0);
});
t("qaFilter：来源过滤与关键字命中关键词表", () => {
  const items = [
    { who: "master", ts: 100, q: "梳理流程图", a: "好的", kw: ["流程", "梳理"], description: "", profile: "" },
    { who: "sub", ts: 200, q: "你是质量审查员", a: "发现列表", kw: ["审查", "质量"], description: "质量审查员", profile: "general-purpose" },
  ];
  eq(qaFilter(items, { who: "master" }).length, 1);
  eq(qaFilter(items, { who: "sub" })[0].profile, "general-purpose");
  eq(qaFilter(items, { kw: "审查" }).length, 1, "关键字应命中关键词表与描述");
  eq(qaFilter(items, {})[0].ts, 200, "默认时间倒序");
});
t("qaLabel：总智能体标签取具体任务，清掉 markdown 链接", () => {
  eq(qaLabel({ who: "master", q: "[@Codex 管家](plugin://codex-manager@x) 添加展开看问答" }), "@Codex 管家 添加展开看问答");
});
t("qaLabel：代码行跳过，取第一个任务行", () => {
  eq(qaLabel({ who: "master", q: "const hits = ALL_TOOLS.filter(f => f.json)\n修复这个统计 bug" }), "修复这个统计 bug");
});
t("qaLabel：子智能体优先用任务描述而不是完整 prompt", () => {
  eq(qaLabel({ who: "sub", description: "质量审查员审查调试流程", q: "你是质量审查员，任务：审查一次 AI 插件调试会话…" }), "质量审查员审查调试流程");
  eq(qaLabel({ who: "sub", description: "", q: "你是效率审查员，任务：找出可省掉的环节" }), "你是效率审查员，任务：找出可省掉的环节");
});
t("qaLabel：图片占位与代码围栏被清除", () => {
  const r = qaLabel({ who: "master", q: "```js\nvar a = 1\n```\n优化线条 [Image: source: C:\\cli\\image-cache\\i.png] 支持拖动" });
  ok(r.indexOf("[Image") < 0, "图片占位应清除：" + r);
  ok(r.indexOf("var") < 0, "代码围栏应清除：" + r);
  eq(r, "优化线条 支持拖动");
});

// ---------- 关键词聚合 / 提示词总结 / 从提示词生成技能草稿 ----------
const qaFixtures = [
  { who: "master", ts: 3000, q: "把会话转成流程图 | 带竖线", a: "好的", kw: ["流程图", "转换", "会话"], tools: ["flow_serve", "node_repl"], sessionId: "sess_A" },
  { who: "master", ts: 2000, q: "修复流程图导出的 bug", a: "已修", kw: ["流程图", "导出", "bug"], tools: ["node_repl"], sessionId: "sess_A" },
  { who: "sub", ts: 2500, q: "你是质量审查员，审查流程图模块", a: "发现问题 3 处", kw: ["审查", "质量"], description: "质量审查员", profile: "general-purpose", tokens: 20864, parentSession: "sess_A" },
  { who: "sub", ts: 1500, q: "你是效率审查员", a: "可省 2 步", kw: ["审查", "效率"], description: "效率审查员", profile: "Explore", tokens: 5120, parentSession: "sess_A" },
];
t("keywordDigest：总/子分区、按次数排序、取前 n", () => {
  const d = keywordDigest(qaFixtures, 12);
  eq(d.master[0], { kw: "流程图", count: 2 });
  eq(d.sub[0], { kw: "审查", count: 2 });
  ok(!d.master.some(x => x.kw === "审查"), "子智能体关键词不应混入总表");
  eq(keywordDigest(qaFixtures, 1).master.length, 1);
  eq(keywordDigest([], 5).sub.length, 0);
});
t("promptSummary：中文 Markdown 含分区/统计/转义竖线", () => {
  const md = promptSummary(qaFixtures, "zh", 1759766400000);
  ok(md.includes("# 提示词总结"), "应含中文标题");
  ok(md.includes("## 任务关键词（总智能体提问）"), "应含总智能体关键词区");
  ok(md.includes("## 子智能体关键词"), "应含子智能体关键词区");
  ok(md.includes("问答条目：4（🧠 总智能体 2 / 🤖 子智能体 2）"), "应含总/子计数");
  ok(md.includes("| 时间 | 任务 | 关键词 | 工具 |"), "应含总智能体表格");
  ok(md.includes("| 时间 | 角色 | 任务 | 关键词 | Tokens |"), "应含子智能体表格");
  ok(md.includes("20864"), "应含子智能体 tokens");
  ok(md.includes("sess_A"), "应含覆盖会话");
  ok(md.includes("把会话转成流程图 / 带竖线"), "正文竖线应替换为 / 避免破坏表格");
  ok(!md.includes("流程图 | 带竖线"), "不应残留原始竖线");
});
t("promptSummary：英文版与语言参数、空数据不崩", () => {
  const en = promptSummary(qaFixtures, "en", 1759766400000);
  ok(en.includes("# Prompt Summary"), "应含英文标题");
  ok(en.includes("## Task keywords (master-agent prompts)"), "应含英文关键词区");
  ok(!en.includes("提示词总结"), "英文版不应含中文标题");
  const empty = promptSummary([], "zh", 1759766400000);
  ok(empty.includes("（无）"), "空数据应显示（无）");
});
t("skillDraftFromPrompts：frontmatter 合法、主题取高频词", () => {
  const md = skillDraftFromPrompts("flow-review", qaFixtures, "zh", "2026-10-07");
  ok(md.startsWith("---\nname: flow-review\n"), "应以 frontmatter 开头且 name=slug");
  ok(md.includes("description: "), "应含 description");
  ok(md.includes("2026-10-07"), "应含生成日期");
  ok(md.includes("## 何时使用"), "应含中文区块");
  ok(md.includes("## 统计"), "应含统计区块");
  ok(md.includes("提问数：2（子智能体记录：2）"), "应含提问统计");
  ok(md.includes("flow_serve"), "应含惯用工具");
  ok(md.includes("把会话转成流程图 | 带竖线"), "近期任务应保留原始任务文本");
  ok(!/^\s*\|/m.test(md), "技能正文不应含表格行");
});
t("skillDraftFromPrompts：英文版", () => {
  const md = skillDraftFromPrompts("flow-review", qaFixtures, "en", "2026-10-07");
  ok(md.includes("## When to use"), "应含英文区块");
  ok(md.includes("## Stats"), "应含英文统计");
  ok(/^---\nname: flow-review\ndescription: /.test(md), "英文 frontmatter 同样合法");
});

// ---------- 多客户端解析（Codex / Qoder）/ 按月聚合 / 一键重点 / 生成画布 ----------
t("parseCodexTurns：过滤系统注入与 developer、工具收集、模型与 cwd", () => {
  const lines = [
    JSON.stringify({ timestamp: "2026-10-01T13:02:38Z", type: "session_meta", payload: { id: "sess_C1", cwd: "C:\\proj" } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:39Z", type: "turn_context", payload: { model: "gpt-6-luna", cwd: "C:\\proj" } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:39Z", type: "response_item", payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "系统指导" }] } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:40Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>注入</environment_context>" }] } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:41Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "帮我检查统计" }] } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:42Z", type: "response_item", payload: { type: "function_call", namespace: "mcp__repl", name: "js", arguments: "{}" } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:43Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "检查完成，无问题。" }] } }),
    JSON.stringify({ timestamp: "2026-10-01T13:02:44Z", type: "response_item", payload: { type: "function_call_output", call_id: "x", output: "ok" } }),
  ].join("\n");
  const r = parseCodexTurns(lines);
  eq(r.session, "sess_C1");
  eq(r.cwd, "C:\\proj");
  eq(r.model, "gpt-6-luna");
  eq(r.turns.length, 1, "developer 与 <环境> 注入不算提问，_output 不算工具");
  eq(r.turns[0].q, "帮我检查统计");
  ok(r.turns[0].a.includes("检查完成"));
  eq(r.turns[0].tools, ["mcp__repl__js"]);
  ok(r.turns[0].kw.length > 0, "回合应有关键词");
  ok(r.turns[0].ts > 0, "回合应有时间戳");
});
t("parseQoderTurns：流式去重取最长、tool_result 跳过、模型记录", () => {
  const lines = [
    JSON.stringify({ type: "workspace-directories", sessionId: "qs1", directories: ["C:\\lun wen"] }),
    JSON.stringify({ type: "runtime-config", model: "auto", timestamp: 1 }),
    JSON.stringify({ type: "user", timestamp: "2026-10-07T01:00:00Z", humanInput: { text: "列出文件" }, message: { role: "user", content: [{ type: "text", text: "列出文件" }] } }),
    JSON.stringify({ type: "assistant", timestamp: "2026-10-07T01:00:01Z", message: { id: "cm1", role: "assistant", model: "dfmodel", content: [{ type: "text", text: "目录：" }] } }),
    JSON.stringify({ type: "assistant", timestamp: "2026-10-07T01:00:02Z", message: { id: "cm1", role: "assistant", model: "dfmodel", content: [{ type: "text", text: "目录：a.md b.md" }, { type: "tool_use", name: "Read", input: {} }] } }),
    JSON.stringify({ type: "user", timestamp: "2026-10-07T01:00:03Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "file body" }] } }),
    JSON.stringify({ type: "assistant", timestamp: "2026-10-07T01:00:04Z", message: { id: "cm2", role: "assistant", model: "dfmodel", content: [{ type: "text", text: "共 2 个文件。" }] } }),
  ].join("\n");
  const r = parseQoderTurns(lines);
  eq(r.session, "qs1");
  eq(r.cwd, "C:\\lun wen");
  eq(r.model, "auto", "会话默认模型取 runtime-config");
  eq(r.turns.length, 1, "tool_result 行不算新提问");
  eq(r.turns[0].q, "列出文件");
  eq(r.turns[0].a, "目录：a.md b.md\n共 2 个文件。", "流式行取最长、多消息按序拼接");
  eq(r.turns[0].tools, ["Read"]);
  eq(r.turns[0].model, "dfmodel", "回合模型取 assistant.message.model");
});
t("parseAnyTurns：自动识别 zcode / codex / qoder / wb / gemini / qwen 与显式指定", () => {
  const z = JSON.stringify({ sessionId: "s1", request: { messagesKind: "full", messages: [{ role: "user", content: "你好" }] } });
  eq(parseAnyTurns(z).session, "s1");
  const c = JSON.stringify({ type: "session_meta", payload: { id: "c1" } });
  eq(parseAnyTurns(c).session, "c1");
  const q = JSON.stringify({ type: "workspace-directories", sessionId: "q1", directories: ["D:\\x"] });
  eq(parseAnyTurns(q).session, "q1");
  eq(parseAnyTurns(c, "codex").session, "c1");
  // WorkBuddy：message + content[]
  const wb = JSON.stringify({ type: "message", role: "user", sessionId: "w1", content: [{ type: "input_text", text: "整理目录" }] });
  eq(parseAnyTurns(wb).session, "w1");
  // Gemini：USER_INPUT
  const gm = JSON.stringify({ type: "USER_INPUT", content: "<USER_REQUEST>\n查文献\n</USER_REQUEST>" });
  const gmr = parseAnyTurns(gm);
  eq(gmr.turns.length, 1);
  eq(gmr.turns[0].q, "查文献");
  // Qwen：runtime.json 元信息
  const qw = JSON.stringify({ schema_version: 1, session_id: "q9", work_dir: "C:\\q", qwen_version: "0.24.7" });
  const qwr = parseAnyTurns(qw);
  eq(qwr.session, "q9");
  eq(qwr.turns.length, 1, "Qwen 无正文 → 登记 1 个会话节点");
  eq(parseAnyTurns("flowchart TD\n a --> b").turns.length, 0, "非 JSON 回退 zcode 解析不崩");
});
t("parseWbTurns：message 记录按 role 组成问答，系统注入过滤，工具调用收集", () => {
  const lines = [
    JSON.stringify({ type: "file-history-snapshot", cwd: "C:\\x" }),
    JSON.stringify({ type: "message", role: "user", sessionId: "ws1", timestamp: 1791379962231, content: [{ type: "input_text", text: "帮我改路径" }] }),
    JSON.stringify({ type: "message", role: "assistant", timestamp: 1791379963000, content: [{ type: "output_text", text: "好的，先看文件。" }] }),
    JSON.stringify({ type: "message", role: "user", timestamp: 1791379964000, content: [{ type: "input_text", text: "<task-notification>\n<task-id>x</task-id>\n</task-notification>" }] }),
    JSON.stringify({ type: "message", role: "user", timestamp: 1791379965000, content: [{ type: "input_text", text: "还有一处" }] }),
    JSON.stringify({ type: "message", role: "assistant", timestamp: 1791379966000, content: [{ type: "output_text", text: "已修复。" }] }),
  ].join("\n");
  const r = parseWbTurns(lines);
  eq(r.session, "ws1");
  eq(r.turns.length, 2, "task-notification 系统注入不算提问");
  eq(r.turns[0].q, "帮我改路径");
  eq(r.turns[0].a, "好的，先看文件。");
  eq(r.turns[1].q, "还有一处");
  ok(r.turns[0].ts > 0, "回合应有时间戳");
});
t("parseGeminiTurns：USER_INPUT 取 <USER_REQUEST> 正文，PLANNER_RESPONSE 归入回答", () => {
  const lines = [
    JSON.stringify({ type: "USER_INPUT", status: "DONE", created_at: "2026-10-04T04:12:21Z", content: "<USER_REQUEST>\n查一下考研择校系统\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nignore me\n</ADDITIONAL_METADATA>" }),
    JSON.stringify({ type: "PLANNER_RESPONSE", status: "DONE", created_at: "2026-10-04T04:12:22Z", thinking: "需要检索关键词", tool_calls: [{ name: "search" }] }),
    JSON.stringify({ type: "GENERIC", status: "DONE", created_at: "2026-10-04T04:12:28Z", content: "返回 3 篇相关文献。" }),
    JSON.stringify({ type: "USER_INPUT", status: "DONE", created_at: "2026-10-04T04:20:00Z", content: "<USER_REQUEST>\n导出表格\n</USER_REQUEST>" }),
  ].join("\n");
  const r = parseGeminiTurns(lines);
  eq(r.turns.length, 2);
  eq(r.turns[0].q, "查一下考研择校系统", "仅取 USER_REQUEST 段，丢弃元信息");
  ok(r.turns[0].a.indexOf("需要检索关键词") >= 0, "thinking 计入回答");
  ok(r.turns[0].a.indexOf("返回 3 篇相关文献。") >= 0, "GENERIC content 计入回答");
  eq(r.turns[0].tools, ["search"]);
  eq(r.turns[1].q, "导出表格");
});
t("parseQwenTurns：runtime.json 无正文 → 单条会话节点，会话 id 与版本入标签", () => {
  const r = parseQwenTurns(JSON.stringify({ schema_version: 1, session_id: "qid1", work_dir: "C:\\Users\\x\\qwen-code\\bin", started_at: 1790759665.1, qwen_version: "0.24.7" }));
  eq(r.session, "qid1");
  eq(r.turns.length, 1);
  ok(r.turns[0].q.indexOf("Qwen Code 会话") >= 0);
  ok(r.turns[0].q.indexOf("v0.24.7") >= 0);
  ok(r.turns[0].a.indexOf("不含对话正文") >= 0, "如实标注无正文");
  eq(parseQwenTurns("not json").turns.length, 0, "坏输入不崩");
});
t("parseQaTurns：无 messageOffset 的旁路窗口不清空已按偏移拼好的历史；全无偏移时退回最后窗口", () => {
  const full = JSON.stringify({ sessionId: "sess_T2", startedAt: "2026-10-07T01:00:00Z", request: { messagesKind: "full", messageOffset: 0, messageCount: 2, messages: [
    { role: "user", content: "开始任务" },
    { role: "assistant", content: [{ type: "text", text: "收到" }] }] } });
  const side = JSON.stringify({ sessionId: "sess_T2", startedAt: "2026-10-07T01:05:00Z", request: { messagesKind: "delta", messages: [
    { role: "user", content: "旁路窗口不应覆盖" }] } });
  const r = parseQaTurns(full + "\n" + side);
  eq(r.turns.length, 1, "无偏移窗口不得覆盖有偏移的历史");
  eq(r.turns[0].q, "开始任务");
  ok(r.turns[0].a.includes("收到"));
  const r2 = parseQaTurns(JSON.stringify({ sessionId: "s", request: { messages: [{ role: "user", content: "甲" }] } }) + "\n" +
                          JSON.stringify({ sessionId: "s", request: { messages: [{ role: "user", content: "乙" }] } }));
  eq(r2.turns.length, 1, "全无偏移时退回最后一条窗口（旧行为保留）");
  eq(r2.turns[0].q, "乙");
});
t("keyPoints：可执行动词与近期优先，得分可解释", () => {
  const items = [
    { who: "master", ts: 1, q: "修复导出的 bug", a: "", kw: ["导出", "bug"], tools: [] },
    { who: "master", ts: 2, q: "随便聊聊", a: "", kw: ["闲聊"], tools: [] },
  ];
  const kp = keyPoints(items, 2);
  eq(kp[0].it.q, "修复导出的 bug");
  ok(kp[0].score > kp[1].score, "动词命中应更高分");
  ok(kp[0].reasons.indexOf("verb") >= 0, "应标注可执行任务原因");
  eq(keyPoints([], 5).length, 0);
});
t("highlightSummary：自动重点+可复用提示词+模板，双语与空数据", () => {
  const md = highlightSummary(qaFixtures, "zh", 1759766400000);
  ok(md.includes("# 重点与可复用提示词"), "应含中文标题");
  ok(md.includes("## ⭐ 重点（自动打分，无需人工标注）"), "应含重点区");
  ok(md.includes("## ♻ 可复用提示词"), "应含提示词区");
  ok(md.includes("## 🧩 模板提示词"), "应含模板区");
  ok(md.includes("修复流程图导出的 bug"), "高分任务应进入可复用提示词");
  const en = highlightSummary(qaFixtures, "en", 1759766400000);
  ok(en.includes("## ⭐ Highlights"), "英文重点区");
  ok(!en.includes("## ⭐ 重点"), "英文模式不应含中文区块");
  ok(highlightSummary([], "zh").includes("（无）"), "空数据不崩");
});
t("flowFromQa：🧠 链 + 🤖 虚线挂载、时间正序、上限与空数据", () => {
  const r = flowFromQa(qaFixtures, { maxNodes: 36 });
  ok(r.code.startsWith("flowchart TD"), "应输出 mermaid");
  eq(r.masters, 2);
  eq(r.subs, 2);
  ok(r.code.includes('m1["🧠'), "总任务带 🧠 前缀");
  ok(r.code.includes('s1["🤖'), "子任务带 🤖 前缀");
  ok(r.code.indexOf("m1") < r.code.indexOf("m2"), "节点编号按时间正序");
  ok(r.code.includes("m1 --> m2"), "总任务应串成链");
  ok(r.code.includes("-.->"), "子任务应虚线挂载");
  const small = flowFromQa(qaFixtures, { maxNodes: 2 });
  eq(small.masters + small.subs, 2, "maxNodes 应限制总量");
  eq(flowFromQa([], {}).code, "", "空数据返回空串");
});
t("flowFromQa + parseMermaid 往返：导入画布所需的节点/虚线边完整", () => {
  const r = flowFromQa(qaFixtures, { maxNodes: 36 });
  const g = parseMermaid(r.code);
  eq(g.errors.length, 0, "生成物应可无错解析");
  eq(g.nodes.length, r.masters + r.subs, "节点数 = 🧠 + 🤖");
  ok(g.edges.some(e => e.style === "solid"), "总任务链是实线");
  ok(g.edges.some(e => e.style === "dotted"), "子智能体挂载是虚线");
  ok(g.nodes.every(n => n.x === 0 && n.y === 0), "解析后待 autoLayout 排版（导入前会重排）");
});
t("flowFromQa：turns 小对话元数据（节点 / 时间 / 子智能体挂载）", () => {
  const r = flowFromQa(qaFixtures, { maxNodes: 36 });
  ok(Array.isArray(r.turns), "应返回 turns 数组");
  eq(r.turns.length, 2, "两条提问 = 两个小对话");
  eq(r.turns.map(x => x.node), ["m1", "m2"], "小对话按时间正序对应节点");
  ok(r.turns[0].q && r.turns[0].ts === 2000, "小对话带提问摘要与时间");
  eq(r.turns.reduce((n, x) => n + x.subs.length, 0), r.subs, "子智能体全部挂到某条小对话上");
  ok(r.turns.some(x => x.subs.length), "至少一条小对话带子智能体");
  eq(flowFromQa([], {}).turns, [], "空数据返回空 turns");
});
t("fmtWfWhen：MM-DD HH:mm 固定格式", () => {
  eq(fmtWfWhen(new Date(2026, 9, 7, 9, 5).getTime()), "10-07 09:05", "两位数补零");
  ok(/^\d{2}-\d{2} \d{2}:\d{2}$/.test(fmtWfWhen(Date.now())), "当前时间格式稳定");
});
t("taskCanvasName：时间+任务命名，重名自动加序号", () => {
  eq(taskCanvasName("10-07 14:30", "修复导出 bug", []), "主流程（10-07 14:30，修复导出 bug）");
  const taken = ["主流程（10-07 14:30，修复导出 bug）", "主流程（10-07 14:30，修复导出 bug 2）"];
  eq(taskCanvasName("10-07 14:30", "修复导出 bug", taken), "主流程（10-07 14:30，修复导出 bug 3）");
  eq(taskCanvasName("10-07 14:30", "", []), "主流程（10-07 14:30，对话）", "空任务名回落「对话」");
});
t("wfTree：对话画布挂父画布下；父缺失/自挂回落顶层", () => {
  const list = [
    { name: "主流程", data: {} },
    { name: "主流程（10-07 14:30，部署）", src: { parent: "主流程" } },
    { name: "孤儿画布", src: { parent: "不存在的父" } },
    { name: "主流程（10-07 15:00，测试）", src: { parent: "主流程" } },
    { name: "自挂画布", src: { parent: "自挂画布" } },
  ];
  const tree = wfTree(list);
  eq(tree.length, 3, "根 = 主流程 + 孤儿 + 自挂");
  eq(tree[0].w.name, "主流程");
  eq(tree[0].children.map(c => c.name), ["主流程（10-07 14:30，部署）", "主流程（10-07 15:00，测试）"], "子画布保持原顺序");
  eq(tree[1].children.length + tree[2].children.length, 0, "孤儿与自挂没有子画布");
  eq(wfTree([]).length, 0, "空列表返回空树");
});
t("qaLabel / isQaContinuation：上下文续接注入不当任务名", () => {
  ok(isQaContinuation("This session is being continued from a previous conversation that ran out of context."), "识别续接注入");
  ok(!isQaContinuation("打开 8380 查看新版效果"), "普通提问不误判");
  ok(!isQaContinuation(""), "空串安全");
  eq(qaLabel({ who: "master", q: "This session is being continued from a previous conversation that ran out of context.\nThe summary below covers the earlier portion." }), "(上下文续接)");
  eq(qaLabel({ who: "master", q: "把会话转成流程图" }), "把会话转成流程图", "普通条目标签不受影响");
});
t("flowTemplate：英文参数输出英文标签，缺省中文不变", () => {
  const zh = flowTemplate("测试");
  ok(zh.nodes.some(n => /输入/.test(n.label)), "缺省应输出中文标签");
  const en = flowTemplate("Test", true);
  ok(en.nodes.some(n => n.label === "Input"), "en=true 应输出英文标签");
  ok(en.nodes.some(n => n.label === "Merge"), "英文骨架应含 Merge");
  eq(en.name, "Test");
});

// ---------- v0.19.0：耗时标注 / 整树导出导入 / Token 成本估算 ----------
t("fmtDurMs：分/时/天档位、双语、无效值返回空", () => {
  eq(fmtDurMs(0), "");
  eq(fmtDurMs(-5), "");
  eq(fmtDurMs(NaN), "");
  eq(fmtDurMs(10 * 1000), "<1分");
  eq(fmtDurMs(30 * 1000), "1分", "30 秒按四舍五入进位到 1 分");
  eq(fmtDurMs(5 * 60000), "5分");
  eq(fmtDurMs(59.4 * 60000), "59分");
  eq(fmtDurMs(65 * 60000), "1时5分");
  eq(fmtDurMs(120 * 60000), "2时");
  eq(fmtDurMs(25 * 3600000), "1天1时");
  eq(fmtDurMs(48 * 3600000), "2天");
  eq(fmtDurMs(10 * 1000, "en"), "<1m");
  eq(fmtDurMs(65 * 60000, "en"), "1h5m");
  eq(fmtDurMs(25 * 3600000, "en"), "1d1h");
});

t("wfDurOfTurns：相邻间隔与首尾跨度；倒挂/缺 ts 记为 0", () => {
  const r = wfDurOfTurns([{ q: "a", ts: 1000 }, { q: "b", ts: 61000 }, { q: "c", ts: 121000 }]);
  eq(r.gaps, [60000, 60000, 0], "最后一次没有下一次提问，记为 0");
  eq(r.total, 120000, "total = 首尾跨度");
  const bad = wfDurOfTurns([{ q: "a", ts: 5000 }, { q: "b", ts: 1000 }, { q: "c" }]);
  eq(bad.gaps, [0, 0, 0], "时间倒挂/缺 ts 一律 0（未知）");
  eq(bad.total, 0);
  eq(wfDurOfTurns([]).gaps, []);
  eq(wfDurOfTurns(null).total, 0);
});

t("subNodeLabel：与 flowFromQa 生成的 🤖 节点标签逐字一致（含截断）", () => {
  const items = [
    { who: "master", ts: 1000, q: "开始任务", a: "", kw: [], tools: [] },
    { who: "sub", ts: 1500, description: "质量审查员审查调试流程", q: "你是质量审查员…", a: "", kw: [], tools: [] },
    { who: "sub", ts: 1600, description: "", q: "你是效率审查员，找出可省掉环节", a: "", kw: [], tools: [] },
  ];
  const r = flowFromQa(items, { maxNodes: 36 });
  const labels = r.code.split("\n").filter(l => l.includes("🤖")).map(l => l.match(/\["(.+)"\]/)[1]);
  const subs = items.filter(x => x.who === "sub");
  eq(subs.map(x => subNodeLabel(x)), labels, "subNodeLabel 必须与画布生成算法一致");
  eq(labels[0], "🤖 质量审查员审查调试流程", "12 字以内不截断");
  eq(labels[1], "🤖 你是效率审查员，找出可省…", "超 12 字截断加省略号");
});

t("wfTreeParse：整树对象往返（含 src/turns 白名单与尺寸上限路径）", () => {
  const tree = { type: "cmflow-tree", v: 1, list: [
    { name: "主流程", data: { dir: "LR", nodes: [{ id: "n1", label: "甲" }], edges: [], subs: [] },
      src: { parent: "", client: "zcode", session: "sess_A", task: "部署", ts: 123, extra: "应被丢弃",
        turns: [{ q: "提问", ts: 1000, node: "m1", subs: ["s1"], junk: "应被丢弃" }] } },
    { name: "", data: { dir: "TD", nodes: [{ id: "n2" }], edges: [], subs: [] } },
  ] };
  const r = wfTreeParse(JSON.stringify(tree));
  ok(r.ok && r.bundle === true, "整树对象应识别为 bundle");
  eq(r.entries.length, 2);
  eq(r.entries[0].name, "主流程");
  eq(r.entries[0].data.dir, "LR");
  eq(r.entries[0].data.nodes.length, 1);
  eq(r.entries[0].src.session, "sess_A");
  eq(r.entries[0].src.turns.length, 1);
  eq(r.entries[0].src.turns[0].q, "提问");
  ok(r.entries[0].src.extra === undefined, "src 未列字段应被丢弃");
  ok(r.entries[0].src.turns[0].junk === undefined, "turns 未列字段应被丢弃");
  eq(r.entries[1].name, "imported-2", "无名画布应生成占位名");
});

t("wfTreeParse：兼容单画布导出与 {data:{nodes}}；坏 JSON/无画布报错", () => {
  const r1 = wfTreeParse(JSON.stringify({ name: "单画布", dir: "TD", nodes: [{ id: "n1" }], edges: [], subs: [] }));
  ok(r1.ok && r1.bundle === false, "单画布导出应可导入且不算 bundle");
  eq(r1.entries[0].name, "单画布");
  eq(r1.entries[0].data.dir, "TD");
  const r2 = wfTreeParse(JSON.stringify({ name: "包装", data: { nodes: [{ id: "x" }] } }));
  ok(r2.ok, "{data:{nodes}} 包装应可导入");
  eq(r2.entries[0].name, "包装");
  eq(r2.entries[0].data.nodes[0].id, "x");
  eq(wfTreeParse("not json").error, "bad-json");
  eq(wfTreeParse('{"a":1}').error, "no-canvas");
  eq(wfTreeParse("").ok, false);
  eq(wfTreeParse("[]").ok, false, "数组顶层不是合法捆绑");
});

t("wfMergeEntries：同会话更新保名、同名异源改名、其余追加、坏条目跳过", () => {
  const list = [
    { name: "主流程（10-07 14:30，部署）", data: { dir: "TD", nodes: [], edges: [], subs: [] }, src: { client: "zcode", session: "s1", task: "部署" } },
    { name: "旧画布", data: { dir: "TD", nodes: [], edges: [], subs: [] }, src: { client: "zcode", session: "s2", task: "旧任务" } },
  ];
  const m = wfMergeEntries(list, [
    { name: "随便改的名字", data: { dir: "LR", nodes: [{ id: "n9" }], edges: [], subs: [] }, src: { client: "zcode", session: "s1", task: "部署" } },
    { name: "旧画布", data: { dir: "TD", nodes: [{ id: "n2" }], edges: [], subs: [] }, src: { client: "zcode", session: "s3", task: "新任务" } },
    { name: "新画布", data: { dir: "TD", nodes: [{ id: "n3" }], edges: [], subs: [] } },
    { name: "坏条目", data: {} },
  ]);
  eq(m.updated, 1); eq(m.renamed, 1); eq(m.added, 2, "改名条目也计入新增（added 含 renamed，UI 明细相加=解析总数）"); eq(m.skipped, 1);
  eq(m.list.length, 4);
  eq(m.list[0].name, "主流程（10-07 14:30，部署）", "同会话更新须保留原画布名");
  eq(m.list[0].data.dir, "LR", "同会话更新应替换画布数据");
  eq(m.list[0].data.name, "主流程（10-07 14:30，部署）", "数据内 name 也应保持原画布名");
  eq(m.list[2].name, "旧画布 · 2", "同名异源应加序号后缀");
  eq(m.list[3].name, "新画布");
  const m2 = wfMergeEntries([{ name: "平名", data: { nodes: [] } }], [{ name: "平名", data: { nodes: [{ id: "z" }] } }]);
  eq(m2.updated, 1, "双方都无会话信息时同名应更新而非改名");
  eq(m2.list.length, 1);
  eq(m2.list[0].data.nodes[0].id, "z");
});

t("priceFor：精确匹配优先、包含匹配取最长键、不区分大小写、无价返回 null", () => {
  const P = { "gpt-5": { in: 1, out: 2, cr: 0.5 }, "gpt-5-mini": { in: 0.25, out: 2, cr: 0.025 } };
  eq(priceFor("gpt-5-mini", P), P["gpt-5-mini"], "精确与包含同时命中时应取 mini 价");
  eq(priceFor("GPT-5-MINI", P), P["gpt-5-mini"], "匹配应不区分大小写");
  eq(priceFor("openai/gpt-5-mini-2026", P), P["gpt-5-mini"], "包含匹配应取最长键");
  eq(priceFor("gpt-4", P), null);
  eq(priceFor("", P), null);
  eq(priceFor("gpt-5", null), null);
});

t("costOfModel：输入/输出/缓存读三路折算；无单价/坏输入返回 null", () => {
  const P = { "gpt-5": { in: 1.25, out: 10, cr: 0.125 } };
  eq(costOfModel({ model: "gpt-5", input: 1000000, output: 100000, cacheRead: 2000000 }, P), 2.5);
  eq(costOfModel({ model: "gpt-5", input: 0, output: 0, cacheRead: 0 }, P), 0);
  eq(costOfModel({ model: "claude-x", input: 100 }, P), null, "未配置单价返回 null（UI 显示 —）");
  eq(costOfModel(null, P), null);
  eq(costOfModel({ model: "gpt-5", input: -5, output: "abc" }, P), 0, "坏值按 0 计");
});

t("fmtCost：四档格式与无效值", () => {
  eq(fmtCost(0.00123), "$0.0012");
  eq(fmtCost(0.5), "$0.500");
  eq(fmtCost(12.5), "$12.50");
  eq(fmtCost(1234.56), "$1,235");
  eq(fmtCost(0), "");
  eq(fmtCost(-1), "");
  eq(fmtCost(NaN), "");
});

// ---------- v0.24.0 项目维度 / 神经网络 ----------
t("projectOf / projectKeyOf：取路径末段；显式 project 优先", () => {
  eq(projectOf("C:\\Users\\me\\proj\\codex-manager"), "codex-manager");
  eq(projectOf("/home/me/work/app/"), "app");
  eq(projectOf(""), "未标注项目");
  eq(projectOf(null), "未标注项目");
  eq(projectKeyOf({ src: { cwd: "/a/b/alpha" } }), "alpha");
  eq(projectKeyOf({ src: { cwd: "/a/b/alpha", project: "显式项目" } }), "显式项目", "显式 project 优先于 cwd");
});

t("groupByProject：对话画布按项目归组，非会话归入「流程框架」", () => {
  const list = [
    { name: "主流程", data: { nodes: [] } },
    { name: "c1", src: { session: "s1", cwd: "/w/p1" }, data: { nodes: [] } },
    { name: "c2", src: { session: "s2", cwd: "/w/p1" }, data: { nodes: [] } },
    { name: "c3", src: { session: "s3", cwd: "/w/p2" }, data: { nodes: [] } },
  ];
  const gs = groupByProject(list);
  const p1 = gs.find(g => g.project === "p1");
  eq(p1.convs.length, 2);
  const fw = gs.find(g => g.project === "流程框架");
  eq(fw.others.length, 1);
  eq(fw.convs.length, 0);
  eq(gs[0].project, "p1", "按会话数降序：p1(2) 在前");
});

t("agentsInProject：同项目内按客户端聚合，统计主/子智能体数", () => {
  const list = [
    { name: "a1", src: { session: "s1", client: "zcode", cwd: "/w/p1", turns: [{ node: "n1", subs: ["x", "y"] }] }, data: { nodes: [] } },
    { name: "a2", src: { session: "s2", client: "codex", cwd: "/w/p1", turns: [{ node: "n2", subs: [] }] }, data: { nodes: [] } },
    { name: "b1", src: { session: "s3", client: "zcode", cwd: "/w/p2" }, data: { nodes: [] } },
  ];
  const ag = agentsInProject(list, "p1");
  eq(ag.length, 2);
  const z = ag.find(a => a.client === "zcode");
  eq(z.canvases.length, 1);
  eq(z.masters, 1);
  eq(z.subs, 2);
  eq(agentsInProject(list, "p2").length, 1, "只统计指定项目");
});

t("projectCollaboration：跨智能体按时间序生成接力链", () => {
  const list = [
    { name: "a1", src: { session: "s1", client: "zcode", cwd: "/w/p1", ts: 100 }, data: { nodes: [] } },
    { name: "b1", src: { session: "s2", client: "codex", cwd: "/w/p1", ts: 200 }, data: { nodes: [] } },
    { name: "a2", src: { session: "s3", client: "zcode", cwd: "/w/p1", ts: 300 }, data: { nodes: [] } },
  ];
  const c = projectCollaboration(list, "p1");
  eq(c.clients.sort(), ["codex", "zcode"]);
  eq(c.links.map(l => l.from + "→" + l.to), ["zcode→codex", "codex→zcode"]);
  eq(projectCollaboration(list, "p2").links.length, 0);
});

t("nnSquarify：squarified treemap 面积按权重、互不重叠、恰好铺满", () => {
  const rect = { x: 10, y: 10, w: 400, h: 300 };
  const items = [{ id: "a", w: 4 }, { id: "b", w: 2 }, { id: "c", w: 1 }, { id: "d", w: 1 }];
  const out = nnSquarify(items, rect);
  eq(out.length, 4, "四个矩形");
  const area = r => r.w * r.h;
  const total = out.reduce((s, r) => s + area(r), 0);
  okTest(Math.abs(total - rect.w * rect.h) < 1, "总面积等于容器");
  eq(Math.round(area(out.find(r => r.id === "a")) / total * 100), 50, "权重 4 占 50%");
  for (let i = 0; i < out.length; i++){
    okTest(out[i].x >= rect.x - 0.5 && out[i].y >= rect.y - 0.5, "不出上/左边界");
    okTest(out[i].x + out[i].w <= rect.x + rect.w + 0.5 && out[i].y + out[i].h <= rect.y + rect.h + 0.5, "不出下/右边界");
    okTest(out[i].w > 0 && out[i].h > 0, "宽高为正");
    for (let j = i + 1; j < out.length; j++){
      const A = out[i], B = out[j];
      const overlap = A.x < B.x + B.w - 0.5 && B.x < A.x + A.w - 0.5 && A.y < B.y + B.h - 0.5 && B.y < A.y + A.h - 0.5;
      okTest(!overlap, "矩形互不重叠：" + A.id + "/" + B.id);
    }
  }
});

t("nnSquarify：权重为 0 / 空数组 / 零面积容器等退化输入不抛异常", () => {
  eq(nnSquarify([], { x: 0, y: 0, w: 100, h: 100 }).length, 0, "空输入返回空");
  eq(nnSquarify([{ id: "a", w: 0 }], { x: 0, y: 0, w: 100, h: 100 }).length, 0, "全零权重返回空");
  eq(nnSquarify([{ id: "a", w: 1 }], { x: 0, y: 0, w: 0, h: 100 }).length, 0, "零宽容器返回空");
  const odd = nnSquarify([{ id: "a", w: 1 }, { id: "b", w: 1 }, { id: "c", w: 1 }], { x: 0, y: 0, w: 7, h: 3 });
  okTest(odd.every(r => Number.isFinite(r.x) && Number.isFinite(r.w)), "极端长宽比下坐标仍有限");
});

t("nnSquarify：长宽比优于朴素横切（squarified 的意义）", () => {
  const rect = { x: 0, y: 0, w: 400, h: 300 };
  const items = [30, 20, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1].map((w, i) => ({ id: "n" + i, w }));
  const out = nnSquarify(items, rect);
  const worst = Math.max.apply(null, out.map(r => Math.max(r.w / r.h, r.h / r.w)));
  okTest(worst < 8, "最差长宽比 < 8（越小越方）：" + worst.toFixed(2));
});

t("ntLinePx：LOD 行像素 = 行高 × 缩放（决定三档阈值）", () => {
  okTest(ntLinePx({ h: 20 }, 1, 1) === 20, "h=20,n=1,z=1 → 20");
  okTest(ntLinePx({ h: 40 }, 2, 1) === 20, "行高按行数均分");
  okTest(ntLinePx({ h: 10 }, 1, 4) > ntLinePx({ h: 10 }, 1, 1), "缩放越大每行像素越大");
  okTest(ntLinePx({ h: 10 }, 1, 1) === ntLinePx({ h: 10 }, 1, 1), "同输入确定性输出");
  okTest(Number.isFinite(ntLinePx(null, 0, 0)) && ntLinePx(null, 0, 0) > 0, "退化输入仍为正有限值");
  // 三档阈值语义：0.6 以下纯色块 / 9 以上真实文字
  okTest(ntLinePx({ h: 10 }, 50, 1) < 0.6, "远看落入色块档");
  okTest(ntLinePx({ h: 20 }, 1, 20) >= 9, "放大后落入文字档");
});

t("ntVisibleChars：可见字符数随宽度线性增长、字号越大越少", () => {
  okTest(ntVisibleChars(200, 10) > ntVisibleChars(100, 10), "宽度越大字符越多");
  okTest(ntVisibleChars(200, 10) > ntVisibleChars(200, 20), "字号越大字符越少");
  eq(ntVisibleChars(0, 10), 0, "零宽为零字符");
  okTest(ntVisibleChars(-5, 10) === 0, "负宽不为负字符");
});

t("ntTokenize：代码分词（关键字/字符串/数字/注释/标识符）", () => {
  const toks = ntTokenize('const x = 42; // 注释');
  okTest(toks.some(t => t.k === "kw" && t.t === "const"), "识别关键字 const");
  okTest(toks.some(t => t.k === "num" && t.t === "42"), "识别数字 42");
  okTest(toks.some(t => t.k === "cmt" && t.t.indexOf("注释") >= 0), "识别行注释");
  okTest(toks.some(t => t.k === "id" && t.t === "x"), "识别标识符 x");
  const str = ntTokenize('let s = "hi there";');
  okTest(str.some(t => t.k === "str" && t.t === '"hi there"'), "整段字符串不被拆散");
  const joined = ntTokenize("a+b*2").map(t => t.t).join("");
  eq(joined, "a+b*2", "分词可无损拼回原文");
  eq(ntTokenize("").length, 0, "空串无 token");
});

t("ntHash：内容哈希稳定且分布合理（条带纹理确定性）", () => {
  eq(ntHash("abc"), ntHash("abc"), "同内容同哈希");
  okTest(ntHash("abc") !== ntHash("abd"), "不同内容不同哈希");
  okTest(ntHash("") >= 0 && ntHash("") <= 0xffffffff, "落在 uint32 范围");
  const buckets = new Set();
  for (let i = 0; i < 200; i++) buckets.add(ntHash("line-" + i) % 16);
  okTest(buckets.size >= 12, "哈希散列到 ≥12/16 个桶：" + buckets.size);
});

t("ntFocusSetIn：悬停聚焦集合（祖先链 + 子孙高亮，其余压暗）", () => {
  const rects = [
    { id: "p:P1", kind: "proj", label: "P1", proj: "P1" },
    { id: "a:P1:zcode", kind: "agent", proj: "P1", client: "zcode" },
    { id: "s:c1", kind: "sess", proj: "P1", client: "zcode" },
    { id: "s:c1#0", kind: "turn", proj: "P1" },
    { id: "s:c1#1", kind: "turn", proj: "P1" },
    { id: "s:c2", kind: "sess", proj: "P1", client: "zcode" },
    { id: "p:P2", kind: "proj", label: "P2", proj: "P2" },
    { id: "s:c9", kind: "sess", proj: "P2", client: "codex" },
  ];
  const f1 = ntFocusSetIn(rects, rects[2]);      // 悬停会话 s:c1
  okTest(f1.has("s:c1") && f1.has("s:c1#0") && f1.has("s:c1#1"), "会话自身与全部对话轮高亮");
  okTest(f1.has("a:P1:zcode") && f1.has("p:P1"), "祖先链（智能体/项目）高亮");
  okTest(!f1.has("s:c2") && !f1.has("p:P2"), "同项目其他会话与无关项目压暗");
  const f2 = ntFocusSetIn(rects, rects[0]);      // 悬停项目 P1
  okTest(f2.has("p:P1") && f2.has("a:P1:zcode") && f2.has("s:c1") && f2.has("s:c2"), "项目高亮：本项目全部后代");
  okTest(!f2.has("p:P2") && !f2.has("s:c9"), "其他项目压暗");
  const f3 = ntFocusSetIn(rects, rects[4]);      // 悬停单个对话轮
  okTest(f3.has("s:c1#1") && f3.has("s:c1"), "轮次高亮其所属会话");
  okTest(!f3.has("s:c1#0"), "同会话其他轮不因轮级悬停而高亮");
  eq(ntFocusSetIn(rects, null).size, 0, "空目标返回空集合");
});

t("ntWrapText：按显示宽度折行、限行数并补省略号", () => {
  const lines = ntWrapText("abcdefghijklmnopqrstuvwxyz0123456789", 100, 3, 11);
  okTest(lines.length <= 3, "不超过限行数");
  okTest(lines.length >= 2, "长文本被折成多行");
  const one = ntWrapText("短", 200, 3, 11);
  eq(one.length, 1, "短文本单行");
  eq(ntWrapText("", 200, 3, 11).length, 0, "空文本零行");
  const clipped = ntWrapText("一二三四五六七八九十".repeat(10), 60, 2, 11);
  okTest(clipped.length <= 2, "硬限 2 行");
  okTest(clipped[clipped.length - 1].indexOf("…") >= 0, "溢出末行补省略号");
});

// ---------- v0.27.2：卡片方框 / 连线路由 / 真实问答正文 ----------

t("ntCardRows：保留显式换行（代码不被压成一行）并按宽度折行", () => {
  const code = ["// 注释行", "const a = 1;", "export default a;"].join("\n");
  const rows = ntCardRows(code, 200, 14);
  okTest(rows.length >= 3, "三行代码至少产生三行（换行被保留）");
  eq(rows[0], "// 注释行", "首行原文");
  eq(rows[1], "const a = 1;", "次行原文");
  // 关键回归：不能像 ntWrapText 那样把 \n 折成空格压成一行
  okTest(rows.join("\n").indexOf("\n") >= 0, "换行没有丢失");
  okTest(ntCardRows(code, 200, 14).join("|").indexOf("// 注释行 const a") < 0, "未被压成一行");
});

t("ntCardRows：超长内容被限行并补省略号", () => {
  const long = Array.from({ length: 40 }, (_, i) => "第 " + i + " 行内容").join("\n");
  const rows = ntCardRows(long, 200, 6);
  eq(rows.length, 6, "硬限 6 行");
  okTest(/…$/.test(rows[5]), "末行补省略号");
});

t("cardBodyLines/ntCardRows：行数按折行结果算，不是字符数（防巨框）", () => {
  // 347 字 doc 在旧实现里会被当成 347 行 → 卡片高 ≈ 5200px
  const doc = "x".repeat(347);
  const rows = ntCardRows(doc, 218, 14);
  okTest(rows.length <= 14, "行数被硬上限夹住（不会变成 347）");
  const lineCount = rows.length;
  okTest(lineCount < 60, "行数是折行结果而非字符数");
});

t("ntPackRows：只返回真实行，绝不循环复读", () => {
  const src = ["问：甲", "答：A", "问：乙"];
  const out = ntPackRows(src, 50);
  eq(new Set(out).size, out.length, "输出内无重复行");
  eq(out.length, 3, "行数 = 真实内容数（不补齐到 want）");
  const dup = ntPackRows(["同", "同", "同"], 10);
  eq(dup.length, 1, "同一句即使重复输入也只留一次");
  eq(ntPackRows([], 5).length, 0, "无内容返回空（不再填占位）");
});

t("qaTextLines：去 ``` 围栏、压空行、限行限量", () => {
  const a = "```js\nconst a = 1;\n```\n\n\n\n第二段内容\n" + "长".repeat(300);
  const rows = qaTextLines(a, 5, 50);
  okTest(rows.every(r => r.indexOf("```") < 0), "围栏行被去掉");
  okTest(rows.length <= 5, "限行");
  okTest(rows.every(r => r.length <= 51), "单行限长（含省略号）");
  eq(qaTextLines("   \n\n  ", 5, 50).length, 0, "空白返回空数组");
});

t("looksLikeCode：代码用等宽字体、说明用普通字体", () => {
  okTest(looksLikeCode("const a = 1;"), "const 语句判为代码");
  okTest(looksLikeCode("SELECT * FROM t"), "SQL 判为代码");
  okTest(looksLikeCode("// 注释"), "注释判为代码");
  okTest(!looksLikeCode("这是一句普通的中文说明"), "中文说明不判为代码");
});

t("segHitsRect：轴线线段与矩形相交判定", () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };
  okTest(segHitsRect(0, 20, 40, 20, r), "水平线穿过矩形");
  okTest(segHitsRect(20, 0, 20, 40, r), "垂直线穿过矩形");
  okTest(!segHitsRect(0, 5, 40, 5, r), "水平线在矩形上方不穿过");
  okTest(!segHitsRect(5, 0, 5, 40, r), "垂直线在矩形左侧不穿过");
  okTest(segHitsRect(0, 20, 40, 20, r, 4), "膨胀后仍相交");
});

t("routeOrtho：LR 前向连接首末段沿端口法线，且不穿其它卡片", () => {
  const a = { x: 0, y: 0, w: 100, h: 60, id: "a" };
  const b = { x: 300, y: 200, w: 100, h: 60, id: "b" };
  const mid = { x: 160, y: 0, w: 60, h: 260, id: "m" };   // 挡在中间的卡片
  const p1 = { x: 100, y: 30 }, p2 = { x: 300, y: 230 };
  const pts = routeOrtho(p1, p2, { dir: "LR", obstacles: [a, b, mid], a, b });
  eq(pts[0].x, p1.x); eq(pts[0].y, p1.y);
  eq(pts[pts.length - 1].x, p2.x); eq(pts[pts.length - 1].y, p2.y);
  // 首段水平、末段水平（LR）
  eq(pts[1].y, p1.y, "首段沿法线（水平）离开");
  eq(pts[pts.length - 2].y, p2.y, "末段沿法线（水平）进入");
  okTest(polylineFree(pts, [a, b, mid], { a, b }, 0), "绕开中间卡片");
});

t("routeOrtho：反馈边（末点在前方左侧）走外绕且不穿卡片", () => {
  const a = { x: 0, y: 0, w: 100, h: 60, id: "a" };
  const b = { x: 300, y: 0, w: 100, h: 60, id: "b" };
  const p1 = { x: 400, y: 30 }, p2 = { x: 300, y: 30 };    // 从 b 右侧回到 b 左侧
  const pts = routeOrtho(p1, p2, { dir: "LR", obstacles: [a, b], a: b, b: a, feedback: true });
  eq(pts[0].x, p1.x); eq(pts[pts.length - 1].x, p2.x);
  okTest(polylineFree(pts, [a, b], { a: b, b: a }, 0), "外绕不穿 a/b");
  const ys = pts.map(p => p.y);
  okTest(Math.min.apply(null, ys) < 30, "确实绕到了上方通道");
});

t("routeOrtho：TD 方向首末段沿垂直法线", () => {
  const a = { x: 0, y: 0, w: 100, h: 60, id: "a" };
  const b = { x: 40, y: 300, w: 100, h: 60, id: "b" };
  const p1 = { x: 50, y: 60 }, p2 = { x: 90, y: 300 };
  const pts = routeOrtho(p1, p2, { dir: "TD", obstacles: [a, b], a, b });
  eq(pts[1].x, p1.x, "首段垂直离开");
  eq(pts[pts.length - 2].x, p2.x, "末段垂直进入");
});

t("routeOrtho：平行边分道产生不同通道", () => {
  const a = { x: 0, y: 0, w: 100, h: 60, id: "a" };
  const b = { x: 400, y: 0, w: 100, h: 60, id: "b" };
  const p1 = { x: 100, y: 30 }, p2 = { x: 400, y: 30 };
  const g1 = routeOrtho(p1, p2, { dir: "LR", obstacles: [a, b], a, b, laneIdx: 0, laneCnt: 3 });
  const g2 = routeOrtho(p1, p2, { dir: "LR", obstacles: [a, b], a, b, laneIdx: 1, laneCnt: 3 });
  okTest(g1[1].x !== g2[1].x, "不同道次的通道位置不同");
});

// ---------- v0.27.3 神经网络信息增强（行角色 / 统计 / 着色 / 时间跨度） ----------
t("ntRoleOf：问 / 答 / 子智能体 / 空行 四类角色判定", () => {
  eq(ntRoleOf("问：实现自动评测"), "ask");
  eq(ntRoleOf("问: 半角冒号也算"), "ask");
  eq(ntRoleOf("🤖 子智能体输出：已完成"), "sub");
  eq(ntRoleOf("  "), "misc");
  eq(ntRoleOf("const a = 1;"), "ans");
  eq(ntRoleOf("按国家标准打分，59.9 不及格。"), "ans");
});

t("ntRoleColor：问=强调色、子智能体=紫、正文=中性（缺省兜底）", () => {
  const accent = "#2563eb", ink = "#64748b";
  eq(ntRoleColor("ask", accent, ink), accent);
  eq(ntRoleColor("sub", accent, ink), "#7c3aed");
  eq(ntRoleColor("ans", accent, ink), ink);
  eq(ntRoleColor("misc", "", ""), "#64748b", "缺省 accent/ink 时仍有合法颜色");
});

t("nnStats：聚合项目/智能体/会话/轮/行/子智能体/字符数与时间跨度", () => {
  const rects = [
    { kind: "proj", id: "p:甲", x: 0, y: 0, w: 100, h: 100 },
    { kind: "agent", id: "a:甲:zcode", client: "zcode", node: { codeLines: 5 } },
    { kind: "sess", id: "s:1", client: "zcode", node: { ts: 1000, stat: { subs: 2 } } },
    { kind: "sess", id: "s:2", client: "codex", node: { ts: 9000, stat: { subs: 1 } } },
    { kind: "turn", id: "s:1#0", lines: ["问：甲", "答案正文"] },
    { kind: "turn", id: "s:1#1", lines: ["🤖 子智能体输出"] },
    { kind: "turn", id: "s:2#0", lines: ["问：乙"] },
  ];
  const s = nnStats(rects);
  eq(s.proj, 1); eq(s.agent, 1); eq(s.sess, 2); eq(s.turn, 3);
  eq(s.lines, 4, "文本行 = 各 turn 行数之和");
  eq(s.ask, 2); eq(s.sub, 1, "画面上可见的 🤖 行数");
  eq(s.subDeclared, 3, "声明式子智能体任务数 = 各会话 stat.subs 之和");
  eq(s.ans, 1);
  eq(s.tMin, 1000); eq(s.tMax, 9000);
  eq(s.clients.zcode, 1); eq(s.clients.codex, 1);
  eq(s.loadMax, 5, "活跃度上限取智能体/会话的 codeLines 最大值");
  okTest(s.chars > 0, "统计了字符数");
});

t("nnStats：空输入不抛异常且各计数为 0", () => {
  const s = nnStats(null);
  eq(s.proj, 0); eq(s.sess, 0); eq(s.turn, 0); eq(s.lines, 0);
  eq(s.tMin, 0); eq(s.tMax, 0); eq(s.loadMax, 0);
  eq(Object.keys(s.clients).length, 0);
});

t("ntShadeOf：client 原样返回；time 早→冷、晚→暖；load 单调变深", () => {
  eq(ntShadeOf("client", { color: "#123456" }), "#123456");
  eq(ntShadeOf("client", {}), "#2563eb", "缺色有默认色");
  const early = ntShadeOf("time", { ts: 0, tMin: 0, tMax: 100 });
  const late = ntShadeOf("time", { ts: 100, tMin: 0, tMax: 100 });
  okTest(early !== late, "时间两端颜色不同");
  const rgb = s => s.match(/\d+/g).map(Number);
  okTest(rgb(late)[0] > rgb(early)[0], "越晚越暖（红分量上升）");
  const lo = rgb(ntShadeOf("load", { load: 0, loadMax: 10 }));
  const hi = rgb(ntShadeOf("load", { load: 10, loadMax: 10 }));
  okTest(hi[0] > lo[0] && hi[1] < lo[1], "越活跃越深（红升绿降）");
  eq(ntShadeOf("time", { ts: 0, tMin: 0, tMax: 0 }), ntShadeOf("time", { ts: 5, tMin: 0, tMax: 0 }), "跨度为零时取恒定中值");
});

t("ntSpanOf：<1 分钟 / 分钟 / 小时 / 天 四档，零跨度返回空单位", () => {
  eq(ntSpanOf(0, 0).unit, "");
  eq(ntSpanOf(1000, 1000).unit, "sec");
  eq(ntSpanOf(0, 5 * 60000).unit, "min");
  eq(ntSpanOf(0, 5 * 60000).n, 5);
  eq(ntSpanOf(0, 3 * 3600000).unit, "hour");
  eq(ntSpanOf(0, 2 * 86400000).unit, "day");
  eq(ntSpanOf(0, 2 * 86400000).n, 2);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);