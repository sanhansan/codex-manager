// 画布几何诊断：注入真实图后导出节点/连线几何，检查方框高度、连线折点、端口位置
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "..", "assets", "flow-editor.html");
const require = createRequire(import.meta.url);
const OUT = "C:/Users/35446/WorkBuddy/2026-10-08-01-51-18/nn-shots";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const root = join(process.env.LOCALAPPDATA, "ms-playwright");
let chrome = null;
for (const d of readdirSync(root)){ if (!/^chromium-/.test(d)) continue;
  for (const rel of ["chrome-win64/chrome.exe","chrome-win/chrome.exe"]){ const fp = join(root,d,rel); if (existsSync(fp)){ chrome = fp; break; } }
  if (chrome) break; }
const pwPath = "C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core";
const { chromium } = require(pwPath);

const MERMAID = [
  "flowchart LR",
  '  n1["自动评测"]',
  '  n2["统计图表"]',
  '  n3["预检通过"]',
  "  n1 -->|是| n2",
  "  n2 --> n3",
].join("\n");

const payload = { workflow: "自动评测引擎", rev: "diag-rev-1", mermaid: MERMAID,
  source: "diag", session: "sess_自动评测引擎", exportName: "自动评测.mmd" };

const html = readFileSync(htmlPath, "utf8");
const tmp = join(here, "_tmp-diag-canvas.html");
writeFileSync(tmp, html.replace("/*__FLOW_DATA__*/null", JSON.stringify(payload)), "utf8");

const DOC1 = [
  "// 自动评测规则库：按《国家学生体质健康标准(2014)》打分",
  "function evaluate(stu, item) {",
  "  const rule = RULES[item.code];",
  "  if (!rule) return { score: 0, level: 'N/A' };",
  "  const score = rule.piecewise(item.value, stu.gender, stu.grade);",
  "  return { score: score, level: levelOf(score) };",
  "}",
  "const RULES = { '50m': { unit: 's', lowerBetter: true } };",
  "export default evaluate;",
].join("\n");
const DOC2 = ["// ECharts 5 统计图表", "const opt = {", "  radar: { indicator: gradeData },",
  "  series: [{ type: 'radar', data: gradeData }],", "};", "chart.setOption(opt);"].join("\n");
const DOC3 = "条件 · 是 / 否（IF / ELSE）：检查规则库是否加载、阈值是否就绪；未就绪则转人工复核分支。";

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 15000 });

// 写进「当前正在渲染的图」g（而不是持久化副本），并按真实 API 重新布局
const info = await page.evaluate(([d1, d2, d3]) => {
  const F = window.__flow;
  const gg = F.g();
  const docs = [d1, d2, d3], files = ["evaluate.js", "chart.js", "01-预检/STEP.md"];
  gg.nodes.forEach((n, i) => { n.doc = docs[i] || ""; n.file = files[i] || ""; if (!n.kind) n.kind = i === 2 ? "cond" : "agent"; });
  gg.dir = "LR";
  if (F.normalize) F.normalize(gg);
  if (F.sizeNode) gg.nodes.forEach(F.sizeNode);
  if (F.refresh) F.refresh(false);
  return {
    dir: gg.dir,
    nodes: gg.nodes.map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y, w: n.w, h: n.h,
      bodyLines: n.bodyLines, docLen: String(n.doc || "").length })),
    edges: gg.edges.map(e => ({ from: e.from, to: e.to, label: e.label })),
    hasAnchors: typeof F.anchors === "function",
    hasEdgePath: typeof F.edgePath === "function",
    hasNorm: typeof F.normalize === "function",
    hasSize: typeof F.sizeNode === "function",
  };
}, [DOC1, DOC2, DOC3]);

console.log("=== 节点几何 ===");
for (const n of info.nodes) console.log(JSON.stringify(n));
console.log("=== 连线 ===", JSON.stringify(info.edges));
console.log("=== 可用 API ===", JSON.stringify({ anchors: info.hasAnchors, edgePath: info.hasEdgePath, normalize: info.hasNorm, sizeNode: info.hasSize }));

// 若可用，直接算出每条边的折点，检查是否穿框
const geo = await page.evaluate(() => {
  const F = window.__flow;
  if (typeof F.edgePath !== "function" || typeof F.edgeMeta !== "function") return "edgePath/edgeMeta 未导出";
  const gg = F.g();
  const metas = F.edgeMeta(gg);
  return gg.edges.map((e, i) => {
    const ep = F.edgePath(e, metas[i]);
    const a = F.anchors(gg.nodes.find(n => n.id === e.from));
    const b = F.anchors(gg.nodes.find(n => n.id === e.to));
    return { i, from: e.from, to: e.to, p1: a.out, p2: b.inn, d: ep && ep.d, mid: ep && ep.mid,
      lane: metas[i] && { idx: metas[i].laneIdx, cnt: metas[i].laneCnt, fb: metas[i].feedback } };
  });
});
console.log("=== 连线几何 ===");
if (typeof geo === "string") console.log(geo);
else for (const g2 of geo) console.log(JSON.stringify(g2));

console.log("=== 页面错误 ===", errs.length ? errs.slice(0, 5).join(" | ") : "none");
await browser.close();
