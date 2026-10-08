// v0.27.4 画布验收：左右连接节点 + 非门 + 左右常驻连接点
// 隔离做法同 shots-nn-enrich.mjs：file:// + PAYLOAD 注入，不连本地服务。
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const OUT = process.env.NN_SHOTS_OUT || join(here, "_shots");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function resolveChromium(){
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null].filter(Boolean);
  for (const root of roots){
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)){
      if (!/^chromium-/.test(d)) continue;
      for (const rel of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"]){
        const fp = join(root, d, rel);
        if (existsSync(fp)) return fp;
      }
    }
  }
  return null;
}
function resolvePlaywright(){
  const c = [];
  try { c.push(require.resolve("playwright-core")); } catch(e){}
  for (const p of [process.env.PLAYWRIGHT_CORE,
    "C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core",
    join(process.env.USERPROFILE || "", ".workbuddy", "binaries", "node", "workspace", "node_modules", "playwright-core")]) if (p) c.push(p);
  return c.find(p => p && existsSync(p)) || null;
}
const pwPath = resolvePlaywright(), chrome = resolveChromium();
if (!pwPath || !chrome){ console.log("SKIP - 需要 playwright-core 与 Chromium"); process.exit(0); }
const { chromium } = require(pwPath);

const MERMAID = ["flowchart LR", '  A["用例设计"]', '  B["执行回归"]', "  A --> B"].join("\n");
const payload = { workflow: "画布节点验收", rev: "shots-canvas-nodes", mermaid: MERMAID, source: "shots-canvas" };
const html = readFileSync(join(here, "..", "assets", "flow-editor.html"), "utf8");
const tmp = join(here, "_tmp-shots-canvas-nodes.html");
writeFileSync(tmp, html.replace("/*__FLOW_DATA__*/null", JSON.stringify(payload)), "utf8");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = []; page.on("pageerror", e => errs.push(String((e && e.message) || e)));
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 20000 });

// 造一段可读的小流程，再依次加：非门 / 左连接 / 右连接
const info = await page.evaluate(() => {
  const F = window.__flow, gg = F.g();
  gg.nodes.length = 0; gg.edges.length = 0; gg.subs.length = 0;
  const mk = (id, label, kind, shape, doc) => ({ id, label, shape: shape || "rect", sub: null, gate: "", subflow: "", kind,
    doc: doc || "", x: 0, y: 0, w: 0, h: 0 });
  gg.nodes.push(mk("p0", "需求：登录接口校验", "input", "round", "POST /api/login，返回 Sa-Token"));
  gg.nodes.push(mk("p1", "实现 LoginController", "agent", "rect", "BCrypt 校验密码\n失败返回 401"));
  gg.nodes.push(mk("p2", "密码校验通过?", "cond", "diamond", ""));
  gg.nodes.push(mk("p3", "签发 Sa-Token", "output", "round", "写回响应头"));
  gg.edges.push({ from: "p0", to: "p1", label: "", style: "solid" });
  gg.edges.push({ from: "p1", to: "p2", label: "", style: "solid" });
  gg.edges.push({ from: "p2", to: "p3", label: "是", style: "solid" });
  document.getElementById("btnLayout").click();   // 先自动重排，避免样例节点全叠在 (0,0)
  const click = k => document.querySelector('#cvTools [data-add="' + k + '"]').click();
  click("not");      // 非门（新类型，自动带 NOT 门）
  click("link-in");  // 左连接（贴最左 + 自动接入口）
  click("link-out"); // 右连接（贴最右 + 自动接出口）
  F.refresh(true);
  const g2 = F.g();
  return {
    nodes: g2.nodes.map(n => ({ id: n.id, kind: n.kind, gate: n.gate, x: Math.round(n.x), y: Math.round(n.y), w: n.w, h: n.h })),
    edges: g2.edges.map(e => e.from + "→" + e.to),
  };
});
await page.waitForTimeout(900);

async function shot(name, prep, settle = 900){
  await page.evaluate(prep);
  await page.waitForTimeout(settle);
  const fp = join(OUT, name + ".png");
  await page.screenshot({ path: fp });
  console.log("shot:", fp);
}
await shot("canvas-1-linknot-overview", () => { window.__flow.showView("canvas"); document.getElementById("btnFit").click(); }, 1200);
await shot("canvas-2-linknot-closeup", () => { for (let i = 0; i < 3; i++) document.getElementById("zIn").click(); }, 1100);
// 暗色下再验一次（连接符 / 非门 / 左右连接点都要清晰）
await shot("canvas-3-linknot-dark", () => {
  document.getElementById("btnTheme").click();
  document.getElementById("btnFit").click();
}, 1200);
console.log("nodes:", JSON.stringify(info.nodes));
console.log("edges:", info.edges.join("  "));
console.log("页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
await page.close();
await browser.close();
