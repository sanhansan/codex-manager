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
writeFileSync(corePath, m[1] + "\nexport { parseMermaid, toMermaid, graphToJSON, jsonToGraph, graphToMarkdown, markdownToGraph, guessKind, aggregateUsage, skillSummary, habitCandidates, ctlLayout, autoLayout, findCycle, validateGraph, newNodeId, sizeNode, upsertNode, splitLabel, joinLabel, flowTemplate, topoOrder, edgeMeta, parseUsageRecords, traceQuery, cleanLabel, fitText, extractKeywords, parseQaTurns, parseAgentRecords, qaFilter };");

const core = await import(pathToFileURL(corePath).href);
  const {
  parseMermaid, toMermaid, graphToJSON, jsonToGraph,
  graphToMarkdown, markdownToGraph,
  guessKind, aggregateUsage, skillSummary, habitCandidates,
  ctlLayout, autoLayout, findCycle, validateGraph, newNodeId,
  splitLabel, joinLabel, flowTemplate, topoOrder, edgeMeta,
  parseUsageRecords, traceQuery, cleanLabel, fitText,
  extractKeywords, parseQaTurns, parseAgentRecords, qaFilter,
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

t("habitCandidates：产出 ≤5 条且带证据", () => {
  const agg = aggregateUsage([
    JSON.stringify({ ts: "2026-10-06T09:00:00Z", kind: "skill", plugin: "a", name: "x", session: "s", cwd: "C:\\one" }),
    JSON.stringify({ ts: "2026-10-06T10:00:00Z", kind: "mcp", plugin: "b", name: "y", session: "s2", cwd: "C:\\two" }),
  ].join("\n"));
  const c = habitCandidates(agg);
  ok(c.length >= 1 && c.length <= 5);
  c.forEach(x => { ok(x.title && x.evidence && x.suggestion, "每条候选需 title/evidence/suggestion"); });
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
