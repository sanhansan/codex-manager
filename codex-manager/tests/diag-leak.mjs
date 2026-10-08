// 注意：本脚本连 http://127.0.0.1:8380（flow_serve.py），会向编辑器推入临时样例画布；
// 若担心污染 ~/.zcode/codex-manager/wf-backup.json，请改用 tests/shots-nn-enrich.mjs（file:// 注入，不连服务）。
// 泄露猎手：扫描「画布面板边界之外」是否出现本该画在画布内的像素
// 做法：截 PNG → 用 canvas 读像素 → 检查面板矩形外侧 2~4px 带内是否有非背景色像素
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
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
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto("http://127.0.0.1:8380/flow-editor.html", { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 20000 });

// 造数据：画布视图放满节点 + 神经网络有内容
await page.evaluate(() => {
  const F = window.__flow, WF = F.wf();
  const name = "泄露猎手-" + Date.now();
  const nodes = [];
  for (let i = 0; i < 6; i++){
    nodes.push({ id: "n" + i, x: (i % 3) * 300, y: Math.floor(i / 3) * 200, w: 236, h: 90,
      label: "节点" + i, kind: ["input","agent","map","cond","merge","output"][i],
      shape: i === 3 ? "diamond" : (i === 0 ? "round" : "rect"),
      doc: "const v" + i + " = " + i + ";\nexport default v" + i + ";", file: "f" + i + ".js" });
  }
  const edges = [{ from: "n0", to: "n1", label: "是" }, { from: "n1", to: "n2", label: "否" },
    { from: "n2", to: "n3", label: "" }, { from: "n3", to: "n4", label: "" },
    { from: "n4", to: "n5", label: "" }, { from: "n5", to: "n0", label: "回退" }];
  WF.list.push({ name, data: { name, dir: "LR", nodes, edges, subs: [] },
    src: { parent: "主流程", client: "zcode", session: "sess_" + name, task: "", ts: Date.now(),
      cwd: "C:/work/泄露", project: "泄露",
      turns: nodes.map((n, i) => ({ node: n.id, q: "第 " + i + " 步要做什么", ts: Date.now() + i * 1000, subs: [],
        a: "第 " + i + " 步已完成：改动点与结论见实现。" })) } });
  F.switchWorkflow(name);
  F.fillWfSel();
});

async function scan(label, viewName){
  await page.evaluate(v => { window.__flow.showView(v); }, viewName);
  await page.waitForTimeout(900);
  const rect = await page.evaluate(v => {
    const el = v === "nn" ? document.querySelector("#viewNn .vbody") : document.getElementById("cvwrap");
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, viewName);
  const buf = await page.screenshot();
  const dataUrl = "data:image/png;base64," + buf.toString("base64");
  const res = await page.evaluate(async ([du, rect]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = du; });
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const at = (x, y) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    // 参考色：面板内侧 6px 处的常见底色（画布底色/面板色）
    const ref = at(Math.round(rect.l + 8), Math.round(rect.t + 8));
    const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 26;
    const band = [];
    // 上边带（面板上方 3~6px）
    for (let y = Math.round(rect.t) - 6; y <= Math.round(rect.t) - 2; y++){
      if (y < 0) continue;
      let hit = 0, sample = null;
      for (let x = Math.round(rect.l); x < Math.round(rect.r); x++){
        const px = at(x, y);
        if (!near(px, ref)){ hit++; if (!sample) sample = { x, y, px }; }
      }
      if (hit) band.push({ side: "top", y, hit, sample });
    }
    // 下边带
    for (let y = Math.round(rect.b) + 2; y <= Math.round(rect.b) + 6; y++){
      if (y >= cv.height) continue;
      let hit = 0, sample = null;
      for (let x = Math.round(rect.l); x < Math.round(rect.r); x++){
        const px = at(x, y);
        if (!near(px, ref)){ hit++; if (!sample) sample = { x, y, px }; }
      }
      if (hit) band.push({ side: "bottom", y, hit, sample });
    }
    // 左边带（面板左侧 3~6px）——注意左侧是侧栏，颜色不同，故参考取更靠左的底色
    const refL = at(Math.max(0, Math.round(rect.l) - 12), Math.round(rect.t + 8));
    for (let x = Math.round(rect.l) - 6; x <= Math.round(rect.l) - 2; x++){
      if (x < 0) continue;
      let hit = 0, sample = null;
      for (let y = Math.round(rect.t); y < Math.round(rect.b); y++){
        const px = at(x, y);
        if (!near(px, refL)){ hit++; if (!sample) sample = { x, y, px }; }
      }
      if (hit) band.push({ side: "left", x, hit, sample });
    }
    return { rect, ref, refL, cv: { w: cv.width, h: cv.height }, band };
  }, [dataUrl, rect]);
  console.log("=== " + label + " ===");
  console.log("面板 rect:", JSON.stringify(res.rect), "画布:", JSON.stringify(res.cv));
  console.log("参考底色(内):", JSON.stringify(res.ref), " 参考底色(左外):", JSON.stringify(res.refL));
  if (!res.band.length) console.log("边界带：干净，无越界像素");
  else for (const b of res.band.slice(0, 14)) console.log("  越界:", JSON.stringify(b));
  return res.band.length;
}

const canvasLeak = await scan("画布视图", "canvas");
const nnLeak = await scan("神经网络视图", "nn");
console.log("\n页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
console.log("越界带数：canvas=" + canvasLeak + " nn=" + nnLeak);
await browser.close();
