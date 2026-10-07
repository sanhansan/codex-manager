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
writeFileSync(corePath, m[1] + "\nexport { parseMermaid, toMermaid, graphToJSON, jsonToGraph, graphToMarkdown, markdownToGraph, guessKind, aggregateUsage, skillSummary, pluginUsageRows, habitCandidates, ctlLayout, autoLayout, findCycle, validateGraph, newNodeId, sizeNode, upsertNode, splitLabel, joinLabel, flowTemplate, topoOrder, edgeMeta, parseUsageRecords, traceQuery, cleanLabel, fitText, extractKeywords, parseQaTurns, parseCodexTurns, parseQoderTurns, parseAnyTurns, keyPoints, highlightSummary, flowFromQa, parseAgentRecords, qaFilter, qaLabel, suggestSlug, skillDraft, keywordDigest, promptSummary, skillDraftFromPrompts };");

const core = await import(pathToFileURL(corePath).href);
  const {
  parseMermaid, toMermaid, graphToJSON, jsonToGraph,
  graphToMarkdown, markdownToGraph,
  guessKind, aggregateUsage, skillSummary, pluginUsageRows, habitCandidates,
  ctlLayout, autoLayout, findCycle, validateGraph, newNodeId,
  splitLabel, joinLabel, flowTemplate, topoOrder, edgeMeta,
  parseUsageRecords, traceQuery, cleanLabel, fitText,
  extractKeywords, parseQaTurns, parseAgentRecords, qaFilter, qaLabel,
  parseCodexTurns, parseQoderTurns, parseAnyTurns, keyPoints, highlightSummary, flowFromQa,
  suggestSlug, skillDraft, keywordDigest, promptSummary, skillDraftFromPrompts,
} = core;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log("ok  -", name); pass++; }
  catch (e) { console.error("FAIL-", name, "::", e.message); fail++; }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || "eq") + "：got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
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
t("parseAnyTurns：自动识别 zcode / codex / qoder 与显式指定", () => {
  const z = JSON.stringify({ sessionId: "s1", request: { messagesKind: "full", messages: [{ role: "user", content: "你好" }] } });
  eq(parseAnyTurns(z).session, "s1");
  const c = JSON.stringify({ type: "session_meta", payload: { id: "c1" } });
  eq(parseAnyTurns(c).session, "c1");
  const q = JSON.stringify({ type: "workspace-directories", sessionId: "q1", directories: ["D:\\x"] });
  eq(parseAnyTurns(q).session, "q1");
  eq(parseAnyTurns(c, "codex").session, "c1");
  eq(parseAnyTurns("flowchart TD\n a --> b").turns.length, 0, "非 JSON 回退 zcode 解析不崩");
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
t("flowTemplate：英文参数输出英文标签，缺省中文不变", () => {
  const zh = flowTemplate("测试");
  ok(zh.nodes.some(n => /输入/.test(n.label)), "缺省应输出中文标签");
  const en = flowTemplate("Test", true);
  ok(en.nodes.some(n => n.label === "Input"), "en=true 应输出英文标签");
  ok(en.nodes.some(n => n.label === "Merge"), "英文骨架应含 Merge");
  eq(en.name, "Test");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
