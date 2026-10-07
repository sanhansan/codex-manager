// v0.27.0 端到端验证：项目分组 / 智能体大框 / 协作 / 面包屑 / 快速切换 /
//                    神经网络视图（Canvas「文字树图」渲染器 #nnCv：四层 treemap / 三档 LOD / 搜索 / 命中跳转 / rAF 生命周期）
//                    分布工作区（项目分框 / 真实对话题目 / 当前画布自动跟随）
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
  // 真实生产路径下卡片标题取 sessionTaskName()（优先 src.task，其次问答首问句）。
  // 这里把 src.task 清掉、注入问答记录，验证「标题真的来自对话内容」这一分支。
  WF.list.forEach(w => { if (w.src) w.src.task = ""; });
  const qa = F.qaItems();
  const seed = [
    ["sess_画布-项目甲-主", "zcode", "实现登录接口"],
    ["sess_画布-项目甲-协作", "codex", "评审登录实现"],
    ["sess_画布-项目乙-主", "gemini", "统计报表设计"],
  ];
  seed.forEach(([sid, client, q], i) => qa.push({ who: "master", client, sessionId: sid, q, a: "", tools: [], ts: 1000 + i, cwd: "C:/work/项目" + (i === 2 ? "乙" : "甲"), kw: [] }));
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

// 神经网络视图（v0.27.0 Canvas「文字树图」渲染器，对齐 Peeter95/code-map）
await page.evaluate(() => { window.__flow.showView("nn"); });
await page.waitForTimeout(600);
const nn = await page.evaluate(() => {
  const cv = document.getElementById("nnCv");
  const st = window.__flow.nnTextState();
  const ctx = cv.getContext("2d");
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let ink = 0;
  for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 0) ink++;
  const rects = st ? st.rects : [];
  const cnt = k => rects.filter(r => r.kind === k).length;
  return {
    hasCv: !!cv, cvW: cv.width, cvH: cv.height, ink: ink,
    total: rects.length,
    proj: cnt("proj"), agent: cnt("agent"), sess: cnt("sess"), turn: cnt("turn"),
    z: window.__flow.nnTextView().z,
    hud: document.getElementById("nnHud").textContent,
    lod: (document.getElementById("nnLod") || {}).textContent || "",
    visible: document.getElementById("viewNn").classList.contains("show"),
  };
});
ok(nn.visible, "神经网络视图可进入");
ok(nn.hasCv && nn.cvW > 0 && nn.cvH > 0, "Canvas 渲染器存在且有尺寸（" + nn.cvW + "×" + nn.cvH + "）");
ok(nn.ink > 0, "Canvas 实际绘制了内容（采样命中 " + nn.ink + "）");
ok(nn.proj === 2, "项目矩形层 = 2（实际 " + nn.proj + "）");
ok(nn.agent >= 3, "智能体矩形层 ≥ 3（实际 " + nn.agent + "）");
ok(nn.sess >= 3, "会话矩形层 ≥ 3（实际 " + nn.sess + "）");
ok(nn.turn >= 3, "对话轮文字行矩形 ≥ 3（实际 " + nn.turn + "）");
ok(nn.total >= 11, "四层嵌套 treemap 矩形总数 ≥ 11（实际 " + nn.total + "）");
ok(/项目/.test(nn.hud) && /会话/.test(nn.hud) && /文本行/.test(nn.hud), "HUD 显示项目/会话/文本行计数");
ok(/fps/.test(nn.hud), "HUD 显示 fps");
ok(/色块档|条带档|文字档/.test(nn.lod), "左上角显示当前 LOD 档位（" + nn.lod + "）");

// 矩形不重叠 + 都在项目容器内（treemap 的核心不变量）
const geo = await page.evaluate(() => {
  const rects = window.__flow.nnTextState().rects;
  const projs = rects.filter(r => r.kind === "proj");
  const sess = rects.filter(r => r.kind === "sess");
  let bad = 0, overlap = 0;
  for (const s of sess){
    const p = projs.find(q => String(s.id).indexOf("s:") === 0 && (rects.find(t => t.id === "a:" + q.label + ":" + s.client) || {}).id);
    if (!s.w || s.w <= 0 || !s.h || s.h <= 0) bad++;
    for (const p2 of projs){
      // 会话矩形必须落在某个项目矩形内（允许 1px 容差）
      if (s.x >= p2.x - 1 && s.y >= p2.y - 1 && s.x + s.w <= p2.x + p2.w + 1 && s.y + s.h <= p2.y + p2.h + 1){ p2._hit = (p2._hit || 0) + 1; }
    }
  }
  for (let i = 0; i < projs.length; i++) for (let j = i + 1; j < projs.length; j++){
    const A = projs[i], B = projs[j];
    if (A.x < B.x + B.w - 1 && B.x < A.x + A.w - 1 && A.y < B.y + B.h - 1 && B.y < A.y + A.h - 1) overlap++;
  }
  const contained = sess.filter(s => projs.some(p => s.x >= p.x - 1 && s.y >= p.y - 1 && s.x + s.w <= p.x + p.w + 1 && s.y + s.h <= p.y + p.h + 1)).length;
  return { bad: bad, projOverlap: overlap, contained: contained, sessN: sess.length };
});
ok(geo.bad === 0, "所有会话矩形宽高为正");
ok(geo.projOverlap === 0, "项目矩形互不重叠（treemap 不变量）");
ok(geo.contained === geo.sessN, "全部 " + geo.sessN + " 个会话矩形都落在所属项目框内");

// LOD 三档：阈值函数随缩放单调
const lod = await page.evaluate(() => {
  const F = window.__flow;
  return {
    tiny: F.ntLinePx({ h: 10 }, 50, 1),
    mid: F.ntLinePx({ h: 20 }, 2, 1),
    big: F.ntLinePx({ h: 20 }, 1, 20),
  };
});
ok(lod.tiny < 0.6, "远看落入「色块档」（line_px=" + lod.tiny.toFixed(3) + " < 0.6）");
ok(lod.big >= 9, "放大落入「文字档」（line_px=" + lod.big.toFixed(1) + " ≥ 9）");

// 缩放档位切换：放大后 LOD 指示应升级（色块 → 条带/文字）
const lodSwitch = await page.evaluate(async () => {
  const F = window.__flow;
  F.showView("nn");
  F.ntFitView(true);
  await new Promise(r => setTimeout(r, 200));
  const before = document.getElementById("nnLod").textContent;
  // 飞进第一个项目矩形内部
  const r = F.nnTextState().rects.find(x => x.kind === "proj");
  F.ntFlyToRect(r);
  await new Promise(r => setTimeout(r, 900));
  const after = document.getElementById("nnLod").textContent;
  return { before: before, after: after, zBefore: null, zAfter: F.nnTextView().z };
});
ok(lodSwitch.after !== lodSwitch.before || /文字档/.test(lodSwitch.after),
  "放大后 LOD 档位升级（" + lodSwitch.before + " → " + lodSwitch.after + "）");

// 相机：放大按钮提升目标缩放
const cam = await page.evaluate(() => {
  const before = window.__flow.nnTextView().z;
  document.getElementById("nnIn").click();
  document.getElementById("nnIn").click();
  return { before: before, tz: window.__flow.nnTextView().tz };
});
ok(cam.tz > cam.before, "放大按钮提升目标缩放（" + cam.before.toFixed(3) + " → " + cam.tz.toFixed(3) + "）");

// 命中测试：取会话矩形内部一点的世界坐标 → 反推屏幕坐标 → 应命中（由内向外判定）
const hitRes = await page.evaluate(() => {
  const F = window.__flow, st = F.nnTextState(), v = F.nnTextView();
  const r = st.rects.find(x => x.kind === "sess");
  // 避开更内层的 turn 矩形，取会话顶部标题带区域
  const wx = r.x + r.w / 2, wy = r.y + 4;
  const sx = wx * v.z + v.x, sy = wy * v.z + v.y;
  const h = F.nnHitTest(sx, sy);
  return { want: r.id, got: h ? h.id : null, kind: h ? h.kind : null };
});
ok(hitRes.got === hitRes.want, "命中测试取到会话矩形（" + hitRes.got + " / kind=" + hitRes.kind + "）");

// 点击会话矩形 → 跳转到该对话画布
await page.evaluate(() => { window.__flow.ntFitView(true); });
await page.waitForTimeout(250);
const beforeActive = await page.evaluate(() => window.__flow.wf().active);
const clickable = await page.evaluate(() => {
  const F = window.__flow, st = F.nnTextState(), v = F.nnTextView();
  const cur = F.wf().active;
  const r = st.rects.find(x => x.kind === "sess" && x.canvas && x.canvas !== cur);
  if (!r) return null;
  const wx = r.x + r.w / 2, wy = r.y + 4;
  const cv = document.getElementById("nnCv");
  const bb = cv.getBoundingClientRect();
  return { x: bb.left + (wx * v.z + v.x), y: bb.top + (wy * v.z + v.y), want: r.canvas };
});
ok(!!clickable, "存在非当前会话的矩形可供点击跳转");
if (clickable){
  await page.mouse.click(clickable.x, clickable.y);
  await page.waitForTimeout(350);
  const jump = await page.evaluate(() => ({ active: window.__flow.wf().active, view: document.getElementById("viewCanvas").classList.contains("show") }));
  ok(jump.view && jump.active === clickable.want,
    "点击会话矩形跳转画布（" + beforeActive + " → " + jump.active + "，目标 " + clickable.want + "）");
}

// 搜索：关键字命中 + Enter 飞下一个 + HUD 命中数
await page.evaluate(() => {
  window.__flow.showView("nn");
  const s = document.getElementById("nnSearch");
  s.value = "项目甲"; s.dispatchEvent(new Event("input"));
});
await page.waitForTimeout(250);
const srch = await page.evaluate(() => ({
  on: window.__flow.nnTextSearchOn(),
  n: window.__flow.nnTextMatches().length,
  hud: document.getElementById("nnHud").textContent,
}));
ok(srch.on && srch.n >= 1, "搜索找到匹配矩形（命中 " + srch.n + "）");
ok(/命中/.test(srch.hud), "HUD 显示搜索命中数");
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
await page.evaluate(() => { const s = document.getElementById("nnSearch"); s.value = ""; s.dispatchEvent(new Event("input")); });

// 三种面积权重模式（按文字行数 / 按对话轮数 / 等面积）均能重建且面积变化
const modes = {};
for (const m of ["lines", "turns", "even"]) {
  await page.evaluate(md => {
    window.__flow.showView("nn");
    const sel = document.getElementById("nnLayout");
    sel.value = md; sel.dispatchEvent(new Event("change"));
  }, m);
  await page.waitForTimeout(350);
  modes[m] = await page.evaluate(() => {
    const st = window.__flow.nnTextState();
    const s = st.rects.filter(r => r.kind === "sess").map(r => Math.round(r.w * r.h));
    const cv = document.getElementById("nnCv"), ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let ink = 0; for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 0) ink++;
    return { areas: s.join(","), n: s.length, ink: ink, rects: st.rects.length };
  });
}
["lines", "turns", "even"].forEach(m => {
  ok(modes[m].n >= 3, "权重模式 " + m + "：会话矩形数 ≥ 3（实际 " + modes[m].n + "）");
  ok(modes[m].ink > 0, "权重模式 " + m + "：渲染出内容");
});
ok(modes.lines.areas !== modes.even.areas, "「按文字行数」与「等面积」产生不同布局（验证权重真的生效）");

// rAF 生命周期：离开视图后循环停止（HUD 不再刷新）
const rafState = await page.evaluate(async () => {
  window.__flow.showView("nn");
  await new Promise(r => setTimeout(r, 400));
  window.__flow.showView("dist");
  await new Promise(r => setTimeout(r, 250));
  const a = document.getElementById("nnHud").textContent;
  await new Promise(r => setTimeout(r, 450));
  const b = document.getElementById("nnHud").textContent;
  return { stable: a === b };
});
ok(rafState.stable, "离开神经网络视图后渲染循环停止（HUD 不再刷新）");

// 分布工作区：项目分框 + 真实对话题目 + 当前画布自动跟随
await page.evaluate(() => {
  window.__flow.switchWorkflow("画布-项目乙-主");
  window.__flow.showView("dist");
});
await page.waitForTimeout(450);
const dist = await page.evaluate(() => {
  const grid = document.getElementById("wfGrid");
  const groups = [...grid.querySelectorAll(".pfgroup")].map(g => ({
    proj: g.dataset.proj,
    cards: g.querySelectorAll(".wfcard").length,
    name: (g.querySelector(".pfname") || {}).textContent || "",
  }));
  const cur = grid.querySelector(".wfcard.wfcur");
  const titles = [...grid.querySelectorAll(".wfcard h5 > span:first-child")].map(e => e.textContent.trim());
  return {
    groups: groups, curTitle: cur ? cur.querySelector("h5 > span:first-child").textContent.trim() : null,
    curName: cur ? cur.dataset.card : null,
    titles: titles, text: grid.textContent,
  };
});
ok(dist.groups.length === 3, "分布工作区按项目分框：2 个会话项目 + 1 个「流程框架」（实际 " + dist.groups.length + " 框）");
ok(dist.groups.filter(g => !/流程框架/.test(g.proj)).length === 2, "会话项目框 = 2（实际 " + dist.groups.filter(g => !/流程框架/.test(g.proj)).length + "）");
ok(dist.groups.some(g => /项目甲/.test(g.proj) && g.cards === 2), "项目甲框内 2 张卡片（zcode + codex 同项目共处一框）");
ok(dist.groups.some(g => /项目乙/.test(g.proj)), "项目乙框存在");
ok(dist.curName === "画布-项目乙-主", "当前画布被标记 wfcur（实际 " + dist.curName + "）");
ok(!/问答画布/.test(dist.text), "卡片标题不再出现「问答画布」");
ok(dist.titles.some(t => /登录接口|评审登录|统计报表/.test(t)), "卡片标题取真实对话题目（来自问答记录）： " + dist.titles.slice(0, 4).join(" / "));
ok(dist.curTitle && /统计报表/.test(dist.curTitle), "当前卡片标题为真实对话题目（" + dist.curTitle + "）");
// ---------- 收尾：汇总 + 释放浏览器（缺这段会让进程挂在打开的浏览器上不退出） ----------
if (errs.length) console.log("\n页面错误：\n  " + errs.slice(0, 8).join("\n  "));
console.log("\n" + pass + " passed, " + fail + " failed" + (errs.length ? " , " + errs.length + " page errors" : ""));
await page.close();
await browser.close();
process.exit(fail > 0 ? 1 : 0);
