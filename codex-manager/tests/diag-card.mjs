// 卡片近景核对 + 数值校验：卡片框高是否装得下正文、文字是否溢出、端口是否在半高、连线是否穿框
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
const { chromium } = require("C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const MERMAID = ["flowchart LR", '  n1["自动评测"]', '  n2["统计图表"]', '  n3["预检通过"]',
  "  n1 -->|是| n2", "  n2 --> n3"].join("\n");
const payload = { workflow: "卡片核对", rev: "card-rev-1", mermaid: MERMAID, source: "card", session: "sess_卡片核对" };
const html = readFileSync(htmlPath, "utf8");
const tmp = join(here, "_tmp-card.html");
writeFileSync(tmp, html.replace("/*__FLOW_DATA__*/null", JSON.stringify(payload)), "utf8");

const DOC1 = ["// 自动评测规则库：按《国家学生体质健康标准(2014)》打分",
  "function evaluate(stu, item) {", "  const rule = RULES[item.code];",
  "  if (!rule) return { score: 0, level: 'N/A' };",
  "  const score = rule.piecewise(item.value, stu.gender, stu.grade);",
  "  return { score: score, level: levelOf(score) };", "}",
  "const RULES = { '50m': { unit: 's', lowerBetter: true } };", "export default evaluate;"].join("\n");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 15000 });

const rep = await page.evaluate(doc => {
  const F = window.__flow, gg = F.g();
  gg.dir = "LR";
  gg.nodes[0].doc = doc; gg.nodes[0].file = "evaluate.js"; gg.nodes[0].kind = "agent";
  gg.nodes.forEach(F.sizeNode);
  gg.edges.push({ from: "n3", to: "n1", label: "复核" });
  F.refresh(true);
  const CARD_W = 236, CARD_PAD = 9, CARD_HEAD = 26, CARD_LINE = 15, CARD_FILE = 16;
  const out = { cards: [], edges: [] };
  gg.nodes.forEach(n => {
    const rows = n.bodyRows || [];
    // 用页面真实量宽度：SVG text 的实际 getBBox
    const gEl = document.querySelector('g[data-node="' + n.id + '"]');
    let textMaxW = 0;
    if (gEl) gEl.querySelectorAll("text.nd-b").forEach(t => { try { textMaxW = Math.max(textMaxW, t.getBBox().width); } catch(e){} });
    const innerW = CARD_W - CARD_PAD * 2;
    const headH = Math.min(CARD_HEAD, n.h);
    const bodyTop = n.y + headH + CARD_PAD;
    const bodyBottom = bodyTop + rows.length * CARD_LINE;
    const fileTop = n.fileLabel ? (n.y + n.h - CARD_FILE) : n.y + n.h;
    out.cards.push({
      id: n.id, h: n.h, rows: rows.length, innerW: innerW,
      textMaxW: Math.round(textMaxW), overflowX: textMaxW > innerW + 0.5,
      bodyBottom: Math.round(bodyBottom), fileTop: Math.round(fileTop),
      bodyOverFile: bodyBottom > fileTop + 0.5,
      expectH: CARD_HEAD + (rows.length ? CARD_PAD + rows.length * CARD_LINE + CARD_PAD : CARD_PAD) + (n.fileLabel ? CARD_FILE : 0),
    });
  });
  const metas = F.edgeMeta(gg);
  gg.edges.forEach((e, i) => {
    const ep = F.edgePath(e, metas[i]);
    const obs = gg.nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h, id: n.id }));
    // 解析 d 里的折点，逐段检测是否穿过非端点卡片
    const nums = String(ep.d).match(/-?\d+(\.\d+)?/g) || [];
    const pts = [];
    for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: +nums[k], y: +nums[k + 1] });
    // 圆角段的 Q 控制点混在数值里，这里退化为「逐点对卡片做包含检测」近似
    let crosses = 0;
    pts.forEach(p => obs.forEach(o => {
      if (o.id === e.from || o.id === e.to) return;
      if (p.x > o.x + 2 && p.x < o.x + o.w - 2 && p.y > o.y + 2 && p.y < o.y + o.h - 2) crosses++;
    }));
    out.edges.push({ from: e.from, to: e.to, fb: !!(metas[i] && metas[i].feedback), d: ep.d,
      ptCount: pts.length, crossesOther: crosses });
  });
  return out;
}, DOC1);

console.log("=== 卡片 ===");
for (const c of rep.cards) console.log(JSON.stringify(c));
console.log("=== 连线 ===");
for (const e of rep.edges) console.log(JSON.stringify(e));
console.log("=== 页面错误 ===", errs.length ? errs.slice(0, 4).join(" | ") : "none");

// 近景：按卡片 1 的真实包围盒裁切
const bb = await page.evaluate(() => {
  const el = document.querySelector('g[data-node="n1"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.max(0, r.x - 70), y: Math.max(0, r.y - 24), width: r.width + 130, height: r.height + 48 };
});
if (bb){
  const fp = join(OUT, "card-closeup-1.png");
  await page.screenshot({ path: fp, clip: bb });
  console.log("shot:", fp, JSON.stringify(bb));
}
await browser.close();
