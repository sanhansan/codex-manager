// v0.24.0 端到端验证：项目分组 / 智能体大框 / 协作 / 面包屑 / 快速切换 / 神经网络视图
// 无头 Chromium 直开 flow-editor.html（离线可跑）。
// 依赖 playwright-core 与 Chromium：环境缺失时**优雅跳过**（不算失败），
// 不影响 `run-tests.mjs`（纯逻辑单测）在任意机器上跑通。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL, } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "..", "assets", "flow-editor.html");
const require = createRequire(import.meta.url);

// 1) 解析 playwright-core（多路径兜底）
function resolvePlaywright(){
  const cands = [];
  try { cands.push(require.resolve("playwright-core")); } catch(e){}
  for (const p of [
    process.env.PLAYWRIGHT_CORE,
    "C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core",
    join(process.env.USERPROFILE || "", ".workbuddy", "binaries", "node", "workspace", "node_modules", "playwright-core"),
  ]) if (p) cands.push(p);
  return cands.find(p => p && existsSync(p)) || null;
}
// 2) 解析 Chromium 可执行文件（多路径兜底）
function resolveChromium(){
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local", "ms-playwright") : null,
  ].filter(Boolean);
  const rels = ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"];
  for (const root of roots){
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)){
      if (!/^chromium-/.test(d)) continue;
      for (const rel of rels){
        const fp = join(root, d, rel);
        if (existsSync(fp)) return fp;
      }
    }
  }
  return null;
}

const pwPath = resolvePlaywright();
const chrome = resolveChromium();
if (!pwPath || !chrome){
  console.log("SKIP - 端到端测试需要 playwright-core 与 Chromium，当前环境缺失：");
  console.log("       playwright-core: " + (pwPath || "未找到"));
  console.log("       chromium:        " + (chrome || "未找到"));
  console.log("       （设置 PLAYWRIGHT_CORE / PLAYWRIGHT_BROWSERS_PATH 后可运行）");
  process.exit(0);
}
const { chromium } = require(pwPath);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c){ console.log("ok  -", m); pass++; } else { console.error("FAIL-", m); fail++; } };

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 15000 });

// 注入 3 个项目的会话画布（模拟多项目 + 跨智能体协作）
await page.evaluate(() => {
  const F = window.__flow;
  const WF = F.wf();
  const mk = (name, client, cwd, ts, turns) => ({
    name, data: { name, dir: "TD", nodes: [{ id: "n1", x: 0, y: 0, w: 180, h: 54, label: name, kind: "agent" }], edges: [], subs: [] },
    src: { parent: WF.active, client, session: "sess_" + name, task: name, ts, cwd, project: cwd.replace(/^.*[\\/]/, ""), turns },
  });
  WF.list.push(
    mk("画布-项目甲-主", "zcode", "C:/work/项目甲", 1000, [
      { node: "n1", q: "实现登录接口", ts: 1000, subs: ["sub1", "sub2"] },
      { node: "n2", q: "补充单元测试", ts: 4000, subs: ["sub3"] },
    ]),
    mk("画布-项目甲-协作", "codex", "C:/work/项目甲", 2000, [{ node: "n3", q: "评审登录实现", ts: 2000, subs: [] }]),
    mk("画布-项目乙-主", "gemini", "C:/work/项目乙", 3000, [{ node: "n4", q: "统计报表设计", ts: 3000, subs: ["sub4"] }]),
  );
  F.fillWfSel();
  return WF.list.length;
});

const list = await page.evaluate(() => {
  const box = document.getElementById("wfList");
  return {
    projGroups: box.querySelectorAll(".wfproj").length,
    agentFrames: box.querySelectorAll(".wfagrp").length,
    coopLines: box.querySelectorAll(".wfcoop, .wfpanc").length,
    rowCount: box.querySelectorAll(".wfrow[data-wf]").length,
    text: box.textContent,
  };
});
ok(list.projGroups === 2, "左侧按项目分组：2 个项目芯片框（实际 " + list.projGroups + "）");
ok(list.agentFrames === 3, "同项目内智能体大框：3 个（zcode/codex/gemini，实际 " + list.agentFrames + "）");
ok(list.coopLines >= 1, "协作关系有体现（实际 " + list.coopLines + "）");
ok(/项目甲/.test(list.text) && /项目乙/.test(list.text), "项目名出现在列表中");
ok(/协作链|协作/.test(list.text), "「协作链/协作」文案出现");

// 点击列表项切换画布
await page.evaluate(() => {
  const el = [...document.querySelectorAll('#wfList .wfrow[data-wf]')].find(r => /画布-项目乙-主/.test(r.dataset.wf));
  el.click();
});
await page.waitForTimeout(200);
const afterClick = await page.evaluate(() => ({ active: window.__flow.wf().active, crumb: document.getElementById("cvCrumb").textContent }));
ok(afterClick.active === "画布-项目乙-主", "点击左侧项可切换画布（实际 " + afterClick.active + "）");
ok(/项目乙/.test(afterClick.crumb), "面包屑显示当前项目：项目乙");
ok(/Gemini/.test(afterClick.crumb), "面包屑显示当前智能体：Gemini");

// 面包屑下拉
await page.evaluate(() => { document.querySelector('#cvCrumb .cb[data-cbm="proj"]').click(); });
await page.waitForTimeout(150);
const menu = await page.evaluate(() => {
  const m = document.querySelector("#cvCrumb .cbmenu");
  return m ? { items: m.querySelectorAll(".mi").length, text: m.textContent } : null;
});
ok(menu && menu.items >= 1, "面包屑项目下拉可展开并列出画布");

// 快速切换面板
await page.evaluate(() => document.getElementById("wfQuickBtn").click());
await page.waitForTimeout(250);
const quick = await page.evaluate(() => {
  const d = document.getElementById("quickDlg");
  return d && d.open ? { items: document.querySelectorAll("#quickBody [data-qs]").length, text: document.getElementById("quickBody").textContent } : null;
});
ok(quick && quick.items >= 4, "快速切换面板列出画布（实际 " + (quick && quick.items) + "）");
await page.evaluate(() => document.getElementById("quickQ").value = "项目乙");
await page.evaluate(() => document.getElementById("quickQ").dispatchEvent(new Event("input")));
await page.waitForTimeout(120);
const filtered = await page.evaluate(() => document.querySelectorAll("#quickBody [data-qs]").length);
ok(filtered === 1, "快速切换支持关键字过滤（实际 " + filtered + "）");
await page.evaluate(() => document.getElementById("quickQ").value = "");
await page.evaluate(() => document.getElementById("quickQ").dispatchEvent(new Event("input")));
await page.evaluate(() => document.querySelector("#quickBody [data-qs]").click());
await page.waitForTimeout(200);
const jumped = await page.evaluate(() => window.__flow.wf().active);
ok(!!jumped, "快速切换面板点击可跳转（active=" + jumped + "）");

// 神经网络视图
await page.evaluate(() => { window.__flow.showView("nn"); });
await page.waitForTimeout(400);
const nn = await page.evaluate(() => {
  const svg = document.getElementById("nnSvg");
  return {
    chips: svg.querySelectorAll("rect.chip").length,
    neurons: svg.querySelectorAll(".nrn").length,
    synapses: svg.querySelectorAll("path.syn").length,
    coop: svg.querySelectorAll("path.syn.l1").length,
    hub: svg.querySelectorAll(".hub").length,
    pins: svg.querySelectorAll("line.pin").length,
    hud: document.getElementById("nnHud").textContent,
    visible: document.getElementById("viewNn").classList.contains("show"),
  };
});
ok(nn.visible, "神经网络视图可进入");
ok(nn.chips === 2, "芯片底板按项目绘制：2（实际 " + nn.chips + "）");
ok(nn.neurons >= 6, "神经元已绘制（实际 " + nn.neurons + "）");
ok(nn.synapses >= 6, "突触已绘制（实际 " + nn.synapses + "）");
ok(nn.coop >= 1, "跨智能体协作突触存在（实际 " + nn.coop + "）");
ok(nn.hub === 1, "存在汇总中心 hub");
ok(nn.pins >= 24, "芯片引脚绘制（实际 " + nn.pins + "）");
ok(errs.length === 0, "无 JS 运行时错误" + (errs.length ? "：" + errs.slice(0, 2).join(" | ") : ""));

// 缩放后文字浮现
const zoomTxt = await page.evaluate(() => {
  const svg = document.getElementById("nnSvg");
  const before = getComputedStyle(document.querySelector("#nnSvg .nrn .txt")).opacity;
  document.getElementById("nnIn").click();
  document.getElementById("nnIn").click();
  return { before: before, after: getComputedStyle(document.querySelector("#nnSvg .nrn .txt")).opacity };
});
ok(zoomTxt.after !== "0", "放大后神经元文字浮现（opacity=" + zoomTxt.after + "）");

// 点击神经元跳转画布
const beforeActive = await page.evaluate(() => window.__flow.wf().active);
const targetCanvas = await page.evaluate(() => {
  const box = window.__flow.wf();
  const g = window.__flow;
  // 找一个「有画布且不是当前画布」的会话神经元
  const sess = [...document.querySelectorAll('#nnSvg .nrn')].filter(x => x.dataset.nn && x.dataset.nn.startsWith('s:'));
  const other = sess.find(x => x.dataset.nn.slice(2) !== window.__flow.wf().active) || sess[0];
  return other ? other.dataset.nn : null;
});
ok(!!targetCanvas, "找到会话神经元节点：" + targetCanvas);
const bb = await page.locator('#nnSvg .nrn[data-nn="' + targetCanvas + '"]').first().boundingBox();
// 点击神经元核心圆（bbox 因右侧标签而偏宽，取左侧圆心处命中）
const hit = await page.evaluate(id => {
  const svg = document.getElementById("nnSvg");
  const g = svg.querySelector('.nrn[data-nn="' + id + '"]');
  const core = g.querySelector("circle.core");
  const pts = svg.getBoundingClientRect();
  const s = svg.viewBox.baseVal;
  const world = document.getElementById("nnWorld");
  const m = core.getScreenCTM ? core.getScreenCTM() : null;
  if (!m) return null;
  return { x: m.e + m.a * 0, y: m.f + m.d * 0 };
}, targetCanvas);
ok(!!hit, "定位到神经元核心圆心");
await page.mouse.click(hit.x, hit.y);
await page.waitForTimeout(300);
const nrnJump = await page.evaluate(() => ({ active: window.__flow.wf().active, view: document.getElementById("viewCanvas").classList.contains("show") }));
ok(nrnJump.view && nrnJump.active !== beforeActive, "点击神经元可跳转画布（" + beforeActive + " → " + nrnJump.active + "）");

// 三种布局
for (const mode of ["net", "tree", "chip"]) {
  await page.evaluate(m => {
    const sel = document.getElementById("nnLayout");
    window.__flow.showView("nn");
    sel.value = m; sel.dispatchEvent(new Event("change"));
  }, mode);
  await page.waitForTimeout(250);
  const n = await page.evaluate(() => document.getElementById("nnSvg").querySelectorAll(".nrn").length);
  ok(n >= 6, "布局 " + mode + " 正常渲染（神经元 " + n + "）");
}

ok(errs.length === 0, "全程无 JS 错误" + (errs.length ? "：" + errs.join(" | ") : ""));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
