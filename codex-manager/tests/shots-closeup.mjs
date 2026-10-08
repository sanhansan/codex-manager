// 近景核对（正确注入方式）：NN 文字档（图2）、画布卡片（图3）、分布工作区
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

const payload = { workflow: "自动评测引擎", rev: "shot-rev-2", mermaid: MERMAID,
  source: "shots", session: "sess_自动评测引擎", exportName: "自动评测.mmd" };

const html = readFileSync(htmlPath, "utf8");
const marker = "/*__FLOW_DATA__*/null";
const injected = html.replace(marker, JSON.stringify(payload));
const tmp = join(here, "_tmp-shots.html");
writeFileSync(tmp, injected, "utf8");

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
const DOC2 = [
  "// ECharts 5 统计图表",
  "const opt = {",
  "  radar: { indicator: [{ name: '速度', max: 100 }, { name: '耐力', max: 100 }] },",
  "  series: [{ type: 'radar', data: gradeData }],",
  "};",
  "chart.setOption(opt);",
].join("\n");
const DOC3 = "条件 · 是 / 否（IF / ELSE）：检查规则库是否加载、阈值是否就绪；未就绪则转人工复核分支。";

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 15000 });

// 补齐卡片正文/文件名 + 加第二个会话（同项目），构造分布工作区分框
// v0.27.2：直接写进**正在渲染的图** g（此前写持久化副本 cur.data.nodes，画布渲染的是 g 的深拷贝，doc 根本没生效）
await page.evaluate(([d1, d2, d3]) => {
  const F = window.__flow, WF = F.wf();
  const gg = F.g();
  const cur = WF.list.find(w => w.name === WF.active);
  const docs = [d1, d2, d3], files = ["evaluate.js", "chart.js", "01-预检/STEP.md"];
  gg.nodes.forEach((n, i) => { n.doc = docs[i] || ""; n.file = files[i] || ""; if (!n.kind) n.kind = i === 2 ? "cond" : "agent"; });
  gg.dir = "LR";
  gg.nodes.forEach(F.sizeNode);
  cur.src = { parent: "主流程", client: "qoder", session: "sess_自动评测引擎", task: "",
    ts: 1000, cwd: "C:/work/体测成绩系统", project: "体测成绩系统",
    turns: [
      { node: "n1", q: "按国家学生体质健康标准实现自动评测规则库", ts: 1000, subs: [], a: "已按《国家学生体质健康标准(2014)》落地规则库：RULES 表按项目 code 索引，piecewise 按性别/年级取分段阈值，返回 {score, level}。" },
      { node: "n2", q: "ECharts 统计图表与雷达图对接", ts: 5000, subs: [], a: "用 ECharts 5 的 radar 系列对接：indicator 取五项素质，data 按班级聚合，chart.setOption 一次绘入。" },
      { node: "n3", q: "校验评分阈值与等级边界", ts: 9000, subs: [], a: "边界用例通过：59.9→不及格、60→及格、79.9→及格、80→良好。" },
    ] };
  // 同项目第二个智能体会话
  WF.list.push({
    name: "成绩导入",
    data: { name: "成绩导入", dir: "LR", nodes: [
      { id: "m1", x: 30, y: 380, w: 236, h: 105, label: "EasyExcel 解析", kind: "agent",
        doc: '@ExcelProperty("学号")\nprivate String studentNo;\n@ExcelProperty("成绩")\nprivate Double score;', file: "ScoreImportDTO.java" },
      { id: "m2", x: 326, y: 380, w: 236, h: 105, label: "批量入库", kind: "agent",
        doc: "insertBatch(list) // 每批 1000 条，事务包裹，失败整批回滚。", file: "ScoreService.java" },
    ], edges: [{ from: "m1", to: "m2", label: "" }], subs: [] },
    src: { parent: "主流程", client: "zcode", session: "sess_成绩导入", task: "",
      ts: 3000, cwd: "C:/work/体测成绩系统", project: "体测成绩系统",
      turns: [
        { node: "m1", q: "实现成绩批量导入与 EasyExcel 解析", ts: 3000, subs: [], a: "EasyExcel 读表头映射 DTO，边读边校验，空值跳过并计入错误行。" },
        { node: "m2", q: "优化批量入库性能与事务边界", ts: 6000, subs: [], a: "每批 1000 条 + 单事务，失败整批回滚；实测 5 万行 3.2 秒。" },
      ] },
  });
  const qa = F.qaItems();
  qa.push({ who: "master", client: "qoder", sessionId: "sess_自动评测引擎", q: "按国家学生体质健康标准实现自动评测规则库", a: "已按《国家学生体质健康标准(2014)》落地规则库：RULES 表按项目 code 索引。", tools: [], ts: 1000, cwd: "C:/work/体测成绩系统", kw: ["评测"] });
  qa.push({ who: "master", client: "zcode", sessionId: "sess_成绩导入", q: "实现成绩批量导入与 EasyExcel 解析", a: "EasyExcel 读表头映射 DTO，边读边校验。", tools: [], ts: 3000, cwd: "C:/work/体测成绩系统", kw: ["导入"] });
  F.fillWfSel();
  // 加一条反馈边（n3 → n1）验证外绕路由不穿卡片
  gg.edges.push({ from: "n3", to: "n1", label: "复核不通过", style: "dotted" });
  F.refresh(true);
}, [DOC1, DOC2, DOC3]);

const shots = [];
async function shot(name, prep, settle = 900){
  await page.evaluate(prep);
  await page.waitForTimeout(settle);
  const fp = join(OUT, name + ".png");
  await page.screenshot({ path: fp });
  shots.push(fp);
  console.log("shot:", fp);
}

// A) 画布：卡片式节点 + 正交连线（图3）
await shot("canvas-3-cards", () => {
  window.__flow.showView("canvas");
  setTimeout(() => document.getElementById("fitBtn") && document.getElementById("fitBtn").click(), 60);
}, 1500);
await page.screenshot({ path: join(OUT, "canvas-3-nodes.png"), clip: { x: 260, y: 300, width: 900, height: 340 } });
shots.push(join(OUT, "canvas-3-nodes.png"));
console.log("shot:", join(OUT, "canvas-3-nodes.png"));

// B) NN 全局（图1）
await shot("nn-5-overview", () => { window.__flow.showView("nn"); window.__flow.ntFitView(true); }, 1200);

// C) NN 文字档近景（图2）：直接对准一个「轮代码块」并给足缩放
await shot("nn-6-code-text", () => {
  const F = window.__flow, st = F.nnTextState();
  const turns = st.rects.filter(x => x.kind === "turn" && x.lines && x.lines.length >= 3);
  const r = turns[0] || st.rects.filter(x => x.kind === "turn")[0];
  if (!r) return;
  // 目标：让一行 ≈ 12px（≥ NT_TEXT_FROM_PX 9），即 z ≈ 12 / (r.h / 行数)
  const rowH = r.h / Math.max(1, r.lines ? r.lines.length : 1);
  const z = Math.max(1, Math.min(220, 12 / Math.max(0.05, rowH)));
  F.ntFlyTo(r.x + r.w / 2, r.y + r.h / 2, z);
  // 飞行缓动（NT_FLY_K=0.2）——直接落到终点，保证截图时已到位
  const v = F.nnTextView();
  v.z = z; v.x = v.tx; v.y = v.ty; v.flying = false;
  F.ntUpdateLod();
}, 1200);

// D) 分布工作区：项目分框 + 真实题目 + 当前跟随
await shot("dist-3-frames", () => { window.__flow.showView("dist"); }, 1200);

console.log("\nerrors:", errs.length ? errs.slice(0, 5).join(" | ") : "none", "(共 " + errs.length + ")");
await browser.close();
