// 注意：本脚本连 http://127.0.0.1:8380（flow_serve.py），会向编辑器推入临时样例画布；
// 若担心污染 ~/.zcode/codex-manager/wf-backup.json，请改用 tests/shots-nn-enrich.mjs（file:// 注入，不连服务）。
// 精确测量：卡片的 rect / 文字 / 端口 在同一节点内的屏幕矩形是否互相越界
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
  const name = "量测-" + Date.now();
  WF.list.push({
    name,
    data: { name, dir: "LR", nodes: [
      { id: "q1", x: 0, y: 0, w: 236, h: 80, label: "起点", kind: "input", shape: "round", doc: "start here", file: "a.js" },
      { id: "q2", x: 300, y: 0, w: 236, h: 80, label: "判定", kind: "cond", shape: "diamond" },
      { id: "q3", x: 600, y: 120, w: 236, h: 80, label: "处理", kind: "agent", doc: "const a = 1;\nexport default a;", file: "b.js" },
    ], edges: [{ from: "q1", to: "q2", label: "是" }, { from: "q2", to: "q3", label: "否" }], subs: [] },
    src: { parent: "主流程", client: "zcode", session: "sess_" + name, task: "", ts: Date.now(),
      cwd: "C:/work/量测", project: "量测", turns: [] },
  });
  F.switchWorkflow(name);
  F.showView("canvas");
  F.refresh(true);
  const cv = document.getElementById("cv");
  const cvR = cv.getBoundingClientRect();
  const gg = F.g();
  const out = [];
  document.querySelectorAll('#cv [data-node]').forEach(gEl => {
    const id = gEl.getAttribute("data-node");
    const n = gg.nodes.find(x => x.id === id);
    const pick = sel => { const e = gEl.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
    const r = o => o ? { l: +o.left.toFixed(1), t: +o.top.toFixed(1), w: +o.width.toFixed(1), h: +o.height.toFixed(1) } : null;
    // 整组（含所有可见子元素）的屏幕范围
    const gR = gEl.getBoundingClientRect();
    // 只看可见几何（排除透明热区）：主 rect + 文字
    const mainRect = pick("rect.nd") || pick("polygon.nd") || pick("path.nd");
    const txts = [...gEl.querySelectorAll("text")].map(t => t.getBoundingClientRect());
    const txtBox = txts.length ? {
      l: Math.min(...txts.map(b => b.left)), t: Math.min(...txts.map(b => b.top)),
      r: Math.max(...txts.map(b => b.right)), b: Math.max(...txts.map(b => b.bottom)),
    } : null;
    const ports = [...gEl.querySelectorAll("circle.port")].map(c => { const b = c.getBoundingClientRect(); return { r: +(b.width / 2).toFixed(1), l: +b.left.toFixed(1), t: +b.top.toFixed(1) }; });
    const hits = [...gEl.querySelectorAll("circle.port-hit")].map(c => { const b = c.getBoundingClientRect(); return { r: +(b.width / 2).toFixed(1) }; });
    // 逐个直接子元素量屏幕矩形，定位「组 bbox 被谁撑大」
    const kids = [...gEl.children].map((ch, i) => {
      const b = ch.getBoundingClientRect();
      return { i, tag: ch.tagName, cls: ch.getAttribute("class") || "",
        txt: (ch.textContent || "").slice(0, 14),
        l: +b.left.toFixed(1), t: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    });
    out.push({
      id, shape: n && n.shape,
      world: n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null,
      worldW: n ? n.w : null,
      main: r(mainRect),
      group: { l: +gR.left.toFixed(1), t: +gR.top.toFixed(1), w: +gR.width.toFixed(1), h: +gR.height.toFixed(1) },
      txtBox: txtBox ? { l: +txtBox.l.toFixed(1), t: +txtBox.t.toFixed(1), w: +(txtBox.r - txtBox.l).toFixed(1), h: +(txtBox.b - txtBox.t).toFixed(1) } : null,
      ports, hits, kids,
    });
  });
  return { cvRect: { l: +cvR.left.toFixed(1), t: +cvR.top.toFixed(1), w: +cvR.width.toFixed(1), h: +cvR.height.toFixed(1) }, nodes: out };
});

console.log("画布视口:", JSON.stringify(rep.cvRect));
for (const n of rep.nodes){
  console.log("----", n.id, "shape=" + n.shape, "world=" + JSON.stringify(n.world));
  console.log("   main (卡片本体):", JSON.stringify(n.main));
  const zFromMain = n.main && n.world ? (n.main.w / n.world.w) : null;
  console.log("   由卡片本体推出的缩放 z =", zFromMain ? zFromMain.toFixed(3) : "n/a");
  console.log("   整组范围:", JSON.stringify(n.group));
  console.log("   文字范围:", JSON.stringify(n.txtBox));
  if (n.main && n.txtBox){
    const overR = +(n.txtBox.l + n.txtBox.w - (n.main.l + n.main.w)).toFixed(1);
    const overB = +(n.txtBox.t + n.txtBox.h - (n.main.t + n.main.h)).toFixed(1);
    const overL = +(n.main.l - n.txtBox.l).toFixed(1);
    console.log("   文字越界: 右 +" + overR + " 下 +" + overB + " 左 +" + overL);
  }
  console.log("   端口半径:", JSON.stringify(n.ports), " 热区半径:", JSON.stringify(n.hits));
  console.log("   组 - 卡片 差:", JSON.stringify({
    dl: +(n.group.l - n.main.l).toFixed(1), dt: +(n.group.t - n.main.t).toFixed(1),
    dr: +((n.group.l + n.group.w) - (n.main.l + n.main.w)).toFixed(1),
    db: +((n.group.t + n.group.h) - (n.main.t + n.main.h)).toFixed(1),
  }));
  for (const k of n.kids){
    const outT = +(n.main.t - k.t).toFixed(1);
    if (outT > 2 || k.t < rep.cvRect.t) console.log("   >>> 越界子元素:", JSON.stringify(k), " 高出卡片顶:", outT);
  }
}
console.log("页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
await browser.close();
