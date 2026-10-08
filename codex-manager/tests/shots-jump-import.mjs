// v0.27.8 验收：①跳转高亮持久化（点胶囊 → 目标一直亮着）②分布工作区 / 项目的「🧠 加入神经网络」按钮
// 隔离做法同 shots-nn-enrich.mjs：file:// + PAYLOAD 注入，不连本地服务（不会动 wf-backup.json）。
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

const MERMAID = ["flowchart LR", '  A["起点"]', '  B["终点"]', "  A --> B"].join("\n");
const payload = { workflow: "跳转与导入验收", rev: "shots-jump-import", mermaid: MERMAID, source: "shots-0028" };
const html = readFileSync(join(here, "..", "assets", "flow-editor.html"), "utf8");
const tmp = join(here, "_tmp-shots-jump-import.html");
writeFileSync(tmp, html.replace("/*__FLOW_DATA__*/null", JSON.stringify(payload)), "utf8");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = []; page.on("pageerror", e => errs.push(String((e && e.message) || e)));
page.on("dialog", d => d.accept());          // v0.27.8 批量导入有确认框
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 20000 });

async function shot(name, prep, settle = 900){
  await page.evaluate(prep);
  await page.waitForTimeout(settle);
  const fp = join(OUT, name + ".png");
  await page.screenshot({ path: fp });
  console.log("shot:", fp);
}

// ---------- 1) 画布：点「谁指向我 / 我指向谁」胶囊 → 目标节点持久高亮 ----------
await shot("0028-1-canvas-pills", () => {
  const F = window.__flow, gg = F.g();
  gg.nodes.length = 0; gg.edges.length = 0; gg.subs.length = 0;
  const mk = (id, label, kind, shape, doc) => ({ id, label, shape: shape || "rect", sub: null, gate: "", subflow: "",
    kind, doc: doc || "", x: 0, y: 0, w: 0, h: 0 });
  gg.nodes.push(mk("p0", "需求：登录接口", "input", "round", "POST /api/login"));
  gg.nodes.push(mk("p1", "实现 LoginController", "agent", "rect", "BCrypt 校验密码\n失败返回 401"));
  gg.nodes.push(mk("p2", "密码校验通过?", "cond", "diamond", ""));
  gg.nodes.push(mk("p3", "签发 Sa-Token", "output", "round", "写回响应头"));
  gg.edges.push({ from: "p0", to: "p1", label: "", style: "solid" });
  gg.edges.push({ from: "p1", to: "p2", label: "", style: "solid" });
  gg.edges.push({ from: "p2", to: "p3", label: "是", style: "solid" });
  F.refresh(true);
  document.getElementById("btnLayout").click();
  document.getElementById("btnFit").click();
  for (let i = 0; i < 2; i++) document.getElementById("zIn").click();   // 放大到胶囊可见（<0.55 会隐藏）
  F.refresh(true);
}, 1200);

const jumped = await page.evaluate(() => {
  const pill = document.querySelector('#cv .io-tag-g[data-jump]');
  if (!pill) return { ok: false };
  const to = pill.getAttribute("data-jump");
  // SVG 元素没有 HTMLElement.click()，但监听器挂在 <g> 上，派发冒泡的 MouseEvent 同样能触发
  pill.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return { ok: true, to: to };
});
console.log("点击胶囊跳转：", JSON.stringify(jumped));

await shot("0028-2-jump-highlight", () => { window.__flow.refresh(true); }, 1000);

const hl = await page.evaluate(() => {
  const g = document.querySelector('#cv g.nd-jump-g');
  return { group: !!g, halo: document.querySelectorAll('#cv .nd-halo').length,
    body: document.querySelectorAll('#cv .nd-jump').length };
});
console.log("高亮元素：", JSON.stringify(hl));

// ---------- 2) 分布工作区：卡片 🧠 + 项目框「🧠 本项目加入」 ----------
await shot("0028-3-dist-nn-buttons", () => {
  const F = window.__flow, WF = F.wf();
  const mk = (name, proj, sess) => ({
    name, data: { name, dir: "LR", nodes: [{ id: "m1", label: name.slice(0, 16), shape: "rect", sub: null,
      gate: "", subflow: "", kind: "agent", doc: "", x: 30, y: 30, w: 236, h: 59, bodyRows: [], bodyLines: 0, fileLabel: "" }],
      edges: [], subs: [] },
    src: { parent: "", client: "zcode", session: sess, task: name, ts: Date.now(), cwd: "C:/work/" + proj,
      project: proj, turns: [] }, order: 0 });
  WF.list.push(mk("登录接口实现", "账号中心", "sess_shot_a"));
  WF.list.push(mk("限流策略", "账号中心", "sess_shot_b"));
  WF.list.push(mk("统计图表联调", "数据看板", "sess_shot_c"));
  F.renderDist ? F.renderDist() : null;
  F.showView("dist");
}, 1200);

const dist = await page.evaluate(() => ({
  card: document.querySelectorAll("#viewDist .wfcard [data-nnon]").length,
  proj: document.querySelectorAll("#viewDist [data-nnproj]").length,
}));
console.log("分布工作区按钮：", JSON.stringify(dist));

// ---------- 3) 问答视图的「🧠 导入神经网络」按钮 ----------
await shot("0028-4-qa-import-btn", () => {
  const F = window.__flow;
  F.showView("qa");
  const b = document.getElementById("qaNnBtn");
  if (b) b.scrollIntoView();
}, 900);

console.log("页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
await page.close();
await browser.close();
