// 注意：本脚本连 http://127.0.0.1:8380（flow_serve.py），会向编辑器推入临时样例画布；
// 若担心污染 ~/.zcode/codex-manager/wf-backup.json，请改用 tests/shots-nn-enrich.mjs（file:// 注入，不连服务）。
// 画布边缘泄露诊断：检查节点/连线/标签的实际绘制范围是否超出画布视口
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.DIAG_OUT || join(here, "_shots");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const root = join(process.env.LOCALAPPDATA, "ms-playwright");
let chrome = null;
for (const d of readdirSync(root)){ if (!/^chromium-/.test(d)) continue;
  for (const rel of ["chrome-win64/chrome.exe","chrome-win/chrome.exe"]){ const fp = join(root,d,rel); if (existsSync(fp)){ chrome = fp; break; } }
  if (chrome) break; }
const { chromium } = require("C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto("http://127.0.0.1:8380/flow-editor.html", { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 20000 });

const rep = await page.evaluate(() => {
  const F = window.__flow, WF = F.wf();
  const name = "边缘核对-" + Date.now();
  // 混入 diamond（菱形故意比节点框大 4~6px）、subflow（虚线）、带 gate 的节点
  WF.list.push({
    name,
    data: { name, dir: "LR", nodes: [
      { id: "e1", x: 0, y: 0, w: 236, h: 90, label: "起点", kind: "input", shape: "round", doc: "start", file: "a.js" },
      { id: "e2", x: 300, y: 0, w: 236, h: 90, label: "判定", kind: "cond", shape: "diamond", doc: "if" },
      { id: "e3", x: 600, y: 140, w: 236, h: 90, label: "子流程", kind: "agent", subflow: "子画布", doc: "sub" },
      { id: "e4", x: 300, y: 300, w: 236, h: 90, label: "带门", kind: "merge", gate: "AND", doc: "merge", file: "b.md" },
    ], edges: [
      { from: "e1", to: "e2", label: "是" },
      { from: "e2", to: "e3", label: "否" },
      { from: "e3", to: "e4", label: "" },
      { from: "e4", to: "e1", label: "回退" },
    ], subs: [{ id: "s1", title: "子分组" }] },
    src: { parent: "主流程", client: "zcode", session: "sess_" + name, task: "",
      ts: Date.now(), cwd: "C:/work/边缘", project: "边缘",
      turns: [{ node: "e4", q: "核对流程", ts: Date.now(), subs: [], a: "按分支逐条核对。" }] },
  });
  F.switchWorkflow(name);
  F.showView("canvas");
  document.getElementById("fitBtn") && document.getElementById("fitBtn").click();

  const cv = document.getElementById("cv");
  const wrap = document.getElementById("cvwrap");
  const cvRect = cv.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const gg = F.g();

  // 逐元素量真实绘制范围（getBBox 给的是几何范围，含描边用 getBoundingClientRect 更准）
  const items = [];
  document.querySelectorAll('#cv [data-node]').forEach(gEl => {
    const id = gEl.getAttribute("data-node");
    const bb = gEl.getBBox();
    // 转成屏幕坐标
    const m = gEl.getScreenCTM();
    const pt = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const p1 = pt(bb.x, bb.y), p2 = pt(bb.x + bb.width, bb.y + bb.height);
    const sx1 = Math.min(p1.x, p2.x), sx2 = Math.max(p1.x, p2.x);
    const sy1 = Math.min(p1.y, p2.y), sy2 = Math.max(p1.y, p2.y);
    const n = gg.nodes.find(x => x.id === id);
    items.push({
      id, kind: n && n.kind, shape: n && n.shape,
      nodeBox: n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null,
      // 相对节点框的溢出量（世界坐标）
      overL: n ? +(n.x - bb.x).toFixed(1) : null,
      overR: n ? +((bb.x + bb.width) - (n.x + n.w)).toFixed(1) : null,
      overT: n ? +(n.y - bb.y).toFixed(1) : null,
      overB: n ? +((bb.y + bb.height) - (n.y + n.h)).toFixed(1) : null,
      // 是否超出画布视口（屏幕坐标，含 1px 容差）
      outLeft: +(cvRect.left - sx1).toFixed(1),
      outRight: +(sx2 - cvRect.right).toFixed(1),
      outTop: +(cvRect.top - sy1).toFixed(1),
      outBottom: +(sy2 - cvRect.bottom).toFixed(1),
      bbox: { w: +bb.width.toFixed(1), h: +bb.height.toFixed(1) },
    });
  });
  // 连线与标签是否超出视口
  const edgeOut = [];
  document.querySelectorAll('#cv path.eg').forEach((p, i) => {
    const bb = p.getBBox();
    const m = p.getScreenCTM();
    const pt = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const p1 = pt(bb.x, bb.y), p2 = pt(bb.x + bb.width, bb.y + bb.height);
    const sx1 = Math.min(p1.x, p2.x), sx2 = Math.max(p1.x, p2.x);
    const sy1 = Math.min(p1.y, p2.y), sy2 = Math.max(p1.y, p2.y);
    const out = Math.max(cvRect.left - sx1, sx2 - cvRect.right, cvRect.top - sy1, sy2 - cvRect.bottom);
    edgeOut.push({ i, out: +out.toFixed(1) });
  });
  const labelOut = [];
  document.querySelectorAll('#cv text.lbl-t, #cv .nd-dur').forEach(t => {
    const r = t.getBoundingClientRect();
    const out = Math.max(cvRect.left - r.left, r.right - cvRect.right, cvRect.top - r.top, r.bottom - cvRect.bottom);
    labelOut.push({ text: (t.textContent || "").slice(0, 12), out: +out.toFixed(1) });
  });
  // wrap vs cv 是否一致（若 svg 比 wrap 大，内容会画到 wrap 外面）
  return { cvRect: { l: cvRect.left, t: cvRect.top, r: cvRect.right, b: cvRect.bottom },
    wrapRect: { l: wrapRect.left, t: wrapRect.top, r: wrapRect.right, b: wrapRect.bottom },
    items, edgeOut, labelOut,
    svgOverflow: getComputedStyle(cv).overflow, wrapOverflow: getComputedStyle(wrap).overflow,
    view: { x: F.g().nodes.length, z: null } };
});

console.log("=== cv vs wrap ===");
console.log("cv  :", JSON.stringify(rep.cvRect));
console.log("wrap:", JSON.stringify(rep.wrapRect));
console.log("overflow: svg=" + rep.svgOverflow + " wrap=" + rep.wrapOverflow);
console.log("=== 节点绘制范围 vs 节点框 ===");
for (const it of rep.items) console.log(JSON.stringify(it));
console.log("=== 连线超出视口 ===", JSON.stringify(rep.edgeOut));
console.log("=== 文字超出视口 ===", JSON.stringify(rep.labelOut));
console.log("页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");

const fp = join(OUT, "edge-check.png");
await page.screenshot({ path: fp });
console.log("shot:", fp);
await browser.close();
