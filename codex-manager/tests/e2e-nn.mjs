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
      { node: "n1", q: "实现登录接口", ts: 1000, subs: ["sub1", "sub2"],
        a: "LoginController 接 /api/login，校验用户名密码后签发 Sa-Token，失败返回 401。" },
      { node: "n2", q: "补充单元测试", ts: 4000, subs: ["sub3"],
        a: "用 JUnit5 + MockMvc 覆盖登录成功/密码错/账号锁定三条路径，断言 token 非空。" },
    ]),
    mk("画布-项目甲-协作", "codex", "C:/work/项目甲", 2000, [
      { node: "n3", q: "评审登录实现", ts: 2000, subs: [], a: "评审意见：密码未加盐，建议改 BCrypt；接口需限流防爆破。" },
    ]),
    mk("画布-项目乙-主", "gemini", "C:/work/项目乙", 3000, [
      { node: "n4", q: "统计报表设计", ts: 3000, subs: ["sub4"], a: "报表按年级/性别双维度聚合，ECharts 柱状图 + 折线图组合展示。" },
    ]),
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

// v0.27.2 神经网络写入「具体问答」：不再是重复标题 / 重复同一句
await page.evaluate(() => { window.__flow.showView("nn"); });
await page.waitForTimeout(300);
const nnText = await page.evaluate(() => {
  const st = window.__flow.nnTextState();
  const turns = st.rects.filter(r => r.kind === "turn" && Array.isArray(r.lines));
  const all = [];
  turns.forEach(r => r.lines.forEach(l => all.push(String(l))));
  // 每个会话内是否有重复行
  const bySess = {};
  turns.forEach(r => {
    const k = r.sessId || "?";
    (bySess[k] = bySess[k] || []).push(...r.lines.map(String));
  });
  const dupInSess = Object.keys(bySess).map(k => {
    const arr = bySess[k];
    return arr.length - new Set(arr).size;
  });
  // 会话正文里的行（按会话聚合）
  const sessLines = {};
  turns.forEach(r => { const k = r.sessId || "?"; (sessLines[k] = sessLines[k] || []).push(...r.lines.map(String)); });
  return {
    total: all.length,
    dupInSessMax: dupInSess.length ? Math.max.apply(null, dupInSess) : 0,
    joined: all.join("\n"),
    sessKeys: Object.keys(sessLines),
    sessJoined: Object.keys(sessLines).map(k => sessLines[k].join("\n")),
  };
});
ok(nnText.total >= 6, "神经网络会话正文有实际文字行（实际 " + nnText.total + "）");
ok(nnText.dupInSessMax === 0, "同一会话内无重复行（最大重复 " + nnText.dupInSessMax + "）——不再复读同一句");
ok(/LoginController|Sa-Token|BCrypt|ECharts|JUnit5/.test(nnText.joined), "正文含回答里的具体内容（代码/库名/结论）");
ok(nnText.sessJoined.filter(s => /LoginController|LoginController|Sa-Token/.test(s)).length >= 1, "回答落在对应会话的正文里");
const qCount = (nnText.joined.match(/问：/g) || []).length;
ok(qCount >= 3, "提问以「问：」前缀写入正文（实际 " + qCount + " 条）");
// 不能只有标题复读：正文行里「问：xxx」这类纯标题行占比不能过高
ok(nnText.total > qCount, "正文内容多于提问条数（说明回答也写进去了）");

// v0.27.2 卡片方框：高度与正文行数一致、正文不重复标题
const cardRep = await page.evaluate(() => {
  const F = window.__flow, WF = F.wf();
  // 切到带 src.turns 的会话画布，卡片正文才会从真实问答里补内容
  F.switchWorkflow("画布-项目甲-主");
  const gg = F.g();
  gg.nodes.forEach(n => { n.doc = ""; n.body = ""; });
  gg._docsFilled = false;
  F.enrichNodeDocs();
  gg.nodes.forEach(F.sizeNode);
  F.refresh(true);
  return gg.nodes.map(n => {
    const rows = n.bodyRows || [];
    const el = document.querySelector('g[data-node="' + n.id + '"]');
    let maxW = 0;
    if (el) el.querySelectorAll("text.nd-b").forEach(t => { try { maxW = Math.max(maxW, t.getBBox().width); } catch(e){} });
    return { id: n.id, h: n.h, rows: rows.length, maxW: Math.round(maxW), label: n.label, joined: rows.join(" ") };
  });
});
const card0 = cardRep[0];
ok(!!card0, "取到卡片用于核对");
ok(card0.h < 600, "卡片高度在合理范围（未因字符数当行数而爆高）：" + card0.h + "px");
ok(card0.rows <= 14, "正文行数被 CARD_MAX_BODY 夹住（实际 " + card0.rows + "）");
ok(card0.maxW <= 236 - 18 + 1, "正文未横向溢出卡片（最宽 " + card0.maxW + "px / 可用 218px）");
ok(card0.joined.indexOf("问：") >= 0 || /LoginController|JUnit5/.test(card0.joined), "卡片正文来自真实问答内容");
ok(card0.joined.indexOf(String(card0.label)) < 0 || card0.joined.length > String(card0.label).length + 4,
   "卡片正文不只是把标题重复一遍");
const badH = cardRep.filter(c => c.h > 400);
ok(badH.length === 0, "没有异常高的方框（实际 " + badH.length + " 个）");

// v0.27.2 连线：不穿过其它卡片、箭头停在端口外
const edgeRep = await page.evaluate(() => {
  const F = window.__flow, gg = F.g();
  // 造一个「中间有卡片挡路」的三点布局
  gg.dir = "LR";
  gg.nodes = [
    { id: "e1", x: 0, y: 0, w: 236, h: 90, label: "起", kind: "input", doc: "start" },
    { id: "e2", x: 320, y: 0, w: 236, h: 300, label: "挡", kind: "agent", doc: "blocker" },
    { id: "e3", x: 640, y: 220, w: 236, h: 90, label: "终", kind: "output", doc: "end" },
  ];
  gg.edges = [{ from: "e1", to: "e3", label: "" }];
  gg.subs = [];
  gg.nodes.forEach(F.sizeNode);
  F.refresh(true);
  const metas = F.edgeMeta(gg);
  const ep = F.edgePath(gg.edges[0], metas[0]);
  const nums = String(ep.d).match(/-?\d+(\.\d+)?/g) || [];
  const pts = [];
  for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: +nums[k], y: +nums[k + 1] });
  const mid = gg.nodes[1];
  const inside = pts.filter(p => p.x > mid.x + 2 && p.x < mid.x + mid.w - 2 && p.y > mid.y + 2 && p.y < mid.y + mid.h - 2);
  const anchors = F.anchors(gg.nodes[2]);
  const tip = pts[pts.length - 1];
  const tipDist = Math.hypot(tip.x - anchors.inn.x, tip.y - anchors.inn.y);
  return { d: ep.d, insideMid: inside.length, tipDist: Math.round(tipDist * 10) / 10, ptCount: pts.length };
});
ok(edgeRep.insideMid === 0, "连线折点不落在挡路卡片内部（实际 " + edgeRep.insideMid + "）");
ok(edgeRep.tipDist >= 6, "箭头尖停在端口外侧（距端口 " + edgeRep.tipDist + "px）");

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
// ========== v0.27.3 神经网络信息增强：统计 HUD / 图例过滤 / 着色维度 / 小地图 / 富 tooltip / 标题徽章 ==========
await page.evaluate(() => { window.__flow.showView("nn"); });
await page.waitForTimeout(700);
const enr = await page.evaluate(() => {
  const F = window.__flow, st = F.nnTextState();
  const stat = F.nnStat();
  const hud = (document.getElementById("nnHud") || {}).textContent || "";
  const legend = document.getElementById("nnLegend");
  const legendChips = legend ? [...legend.querySelectorAll(".lg[data-cl]")].map(e => ({
    cl: e.dataset.cl, txt: e.textContent.trim(), off: e.classList.contains("off") })) : [];
  const colorSel = document.getElementById("nnColor");
  const mini = document.getElementById("nnMini");
  const proj = st.rects.filter(r => r.kind === "proj");
  const sess = st.rects.filter(r => r.kind === "sess");
  const turn = st.rects.filter(r => r.kind === "turn");
  return {
    stat: stat, hud: hud, legendChips: legendChips, colorOpts: colorSel ? colorSel.options.length : 0,
    miniW: mini ? mini.width : 0, miniH: mini ? mini.height : 0,
    projStat: proj.filter(r => r.stat).length, projN: proj.length,
    sessStat: sess.filter(r => r.stat).length, sessN: sess.length,
    turnRole: turn.filter(r => r.role).length, turnN: turn.length,
    roleKinds: [...new Set(turn.map(r => r.role))],
    miniBox: !!F.ntMiniBox(),
    cclient: (function(){ const old = F.nnColor(); F.setNnColor("client");
      const c = F.ntRectColor(sess[0] || {}, F.nnTextState().th); F.setNnColor(old); return c; })(),
    ctime: (function(){ const old = F.nnColor(); F.setNnColor("time");
      const c = F.ntRectColor(sess[0] || {}, F.nnTextState().th); F.setNnColor(old); return c; })(),
    cload: (function(){ const old = F.nnColor(); F.setNnColor("load");
      const c = F.ntRectColor(sess[0] || {}, F.nnTextState().th); F.setNnColor(old); return c; })(),
  };
});
ok(enr.stat && enr.stat.proj > 0 && enr.stat.sess > 0, "神经网络统计：项目/会话计数可用（" + (enr.stat ? enr.stat.proj + " 项目 / " + enr.stat.sess + " 会话" : "无") + "）");
ok(enr.stat && enr.stat.turn > 0 && enr.stat.lines > 0, "神经网络统计：对话轮 / 文本行统计可用（" + (enr.stat ? enr.stat.turn + " 轮 / " + enr.stat.lines + " 行" : "无") + "）");
ok(enr.stat && enr.stat.clients && Object.keys(enr.stat.clients).length >= 2, "神经网络统计：按智能体计数覆盖多个客户端");
ok(/智能体/.test(enr.hud) && /对话轮/.test(enr.hud) && /跨度/.test(enr.hud), "HUD 新增「智能体 / 对话轮 / 跨度」芯片");
ok(/子智能体/.test(enr.hud), "HUD 显示子智能体数量芯片");
ok(enr.legendChips.length >= 2, "智能体图例渲染出 ≥2 个客户端芯片（实际 " + enr.legendChips.length + "）");
ok(enr.colorOpts === 3, "着色维度下拉有 3 个选项（按智能体 / 按时间 / 按活跃度）");
ok(enr.miniW > 0 && enr.miniH > 0 && enr.miniBox, "小地图 canvas 已按 DPR 尺寸化且几何可用");
ok(enr.projStat === enr.projN && enr.projN > 0, "项目矩形全部挂载统计（" + enr.projStat + "/" + enr.projN + "）");
ok(enr.sessStat === enr.sessN && enr.sessN > 0, "会话矩形全部挂载统计（" + enr.sessStat + "/" + enr.sessN + "）");
ok(enr.turnRole === enr.turnN && enr.turnN > 0, "对话轮矩形全部带角色标记（" + enr.turnRole + "/" + enr.turnN + "）");
ok(enr.roleKinds.indexOf("ask") >= 0, "角色标记包含「问」（" + enr.roleKinds.join("/") + "）");
ok(enr.ctime !== enr.cclient && enr.cload !== enr.cclient, "着色维度「按时间 / 按活跃度」与原色不同（即时生效）");

// 图例点击 → 过滤为单一智能体；再点 → 取消
const nnFiltered = await page.evaluate(async () => {
  const F = window.__flow;
  const before = F.nnTextState().stat;
  const chip = document.querySelector("#nnLegend .lg[data-cl]");
  const cl = chip && chip.dataset.cl;
  chip.click();
  await new Promise(r => setTimeout(r, 260));
  const after = F.nnTextState().stat;
  const only = F.nnFilter();
  const legendNow = [...document.querySelectorAll("#nnLegend .lg[data-cl]")];
  const hasReset = !!document.getElementById("nnLegendReset");
  // 复位
  const rs = document.getElementById("nnLegendReset");
  if (rs) rs.click();
  await new Promise(r => setTimeout(r, 260));
  const back = F.nnTextState().stat;
  return { cl, only, hasReset, sessBefore: before.sess, sessAfter: after.sess, sessBack: back.sess,
    clientsAfter: Object.keys(after.clients || {}).length, clientsBack: Object.keys(back.clients || {}).length };
});
ok(nnFiltered.only && nnFiltered.only === nnFiltered.cl, "点击图例后进入单智能体过滤（" + nnFiltered.only + "）");
ok(nnFiltered.clientsAfter === 1, "过滤后只剩 1 个客户端的会话（实际 " + nnFiltered.clientsAfter + "）");
ok(nnFiltered.sessAfter <= nnFiltered.sessBefore, "过滤后会话数不增加（" + nnFiltered.sessBefore + " → " + nnFiltered.sessAfter + "）");
ok(nnFiltered.hasReset, "过滤态出现「显示全部」复位入口");
ok(nnFiltered.clientsBack >= 2 && nnFiltered.sessBack === nnFiltered.sessBefore, "复位后恢复全部客户端与会话数（" + nnFiltered.sessBack + "）");

// 悬停会话矩形 → tooltip 富信息（含跳转提示）；悬停对话轮 → 角色/轮次信息
const tipHtml = await page.evaluate(async () => {
  const F = window.__flow;
  F.showView("nn");
  await new Promise(r => setTimeout(r, 400));
  const st = F.nnTextState(), v = F.nnTextView();
  const hover = async (rc, px, py) => {
    // 相机直接落到目标（绕开 NT_FLY_K 缓动），再按世界→屏幕映射派发 pointermove
    const scale = Math.max(2, Math.min(60, 240 / Math.max(40, rc.w)));
    v.tz = scale; v.tx = st.bw / 2 - (rc.x + rc.w / 2) * scale; v.ty = st.bh / 2 - (rc.y + rc.h / 2) * scale;
    v.z = scale; v.x = v.tx; v.y = v.ty; v.tz = scale; v.flying = false;
    await new Promise(r2 => setTimeout(r2, 120));
    const cv = document.getElementById("nnCv");
    const r0 = cv.getBoundingClientRect();
    const sx = r0.left + (rc.x + px) * v.z + v.x;
    const sy = r0.top + (rc.y + py) * v.z + v.y;
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: sx, clientY: sy, bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 220));
    const t = document.getElementById("nnTip");
    const hit = F.nnHitTest(sx - r0.left, sy - r0.top);
    return { disp: t ? t.style.display : "", html: t ? t.innerHTML : "", kind: hit ? hit.kind : "" };
  };
  const s = st.rects.filter(r => r.kind === "sess")[0];
  // 会话矩形顶部 2px 是「抬头条」，不会被内部 turn 覆盖 → 命中 sess
  const sessTip = await hover(s, s.w / 2, Math.min(3, Math.max(1, s.h * 0.1)));
  const t0 = st.rects.filter(r => r.kind === "turn" && r.h > 2)[0];
  const turnTip = await hover(t0, t0.w / 2, t0.h / 2);
  return { sessTip: sessTip, turnTip: turnTip };
});
ok(tipHtml.sessTip.kind === "sess", "会话抬头条命中会话矩形（实际 " + tipHtml.sessTip.kind + "）");
ok(tipHtml.sessTip.disp === "block" && /点击跳转该画布/.test(tipHtml.sessTip.html), "悬停会话 → tooltip 提示「点击跳转该画布」");
ok(/💬/.test(tipHtml.sessTip.html) && /📄/.test(tipHtml.sessTip.html), "会话 tooltip 展示轮数 / 文本行等富信息");
ok(tipHtml.turnTip.kind === "turn" && /第 \d+ 轮/.test(tipHtml.turnTip.html), "悬停对话轮 → tooltip 展示「第 N 轮 · 共 M 行」");
ok(/角色：/.test(tipHtml.turnTip.html), "对话轮 tooltip 展示行角色（问 / 回答正文 / 子智能体输出）");

// v0.27.3 回归：存在「同名但无 src」的画布时，神经网络不得丢失该会话正文
// （旧实现 ntSessionLines 只按 name 在 list 里 find，会命中同名种子画布 → 整块空白）
const dupName = await page.evaluate(async () => {
  const F = window.__flow, WF = F.wf();
  const conv = WF.list.find(w => w.src && w.src.session);
  const decoy = { name: conv.name, data: { name: conv.name, dir: "TD", nodes: [], edges: [], subs: [] } };
  WF.list.unshift(decoy);                       // 同名且排在最前 → 旧实现必然命中它
  F.renderNn();
  await new Promise(r => setTimeout(r, 600));
  const st = F.nnTextState();
  const turns = st.rects.filter(r => r.kind === "turn" && (r.lines || []).length);
  const lines = st.stat ? st.stat.lines : 0;
  WF.list.splice(WF.list.indexOf(decoy), 1);    // 复原
  F.renderNn();
  await new Promise(r => setTimeout(r, 400));
  return { turns: turns.length, lines: lines };
});
ok(dupName.turns > 0 && dupName.lines > 0,
  "同名（无 src）画布存在时神经网络仍有正文（" + dupName.turns + " 块 / " + dupName.lines + " 行）");

// ========== v0.27.6 分布工作区：拖动调整 / 新建项目 / 删除 / 一键加入神经网络 ==========
await page.evaluate(() => { window.__flow.showView("dist"); });
await page.waitForTimeout(500);
const distUi = await page.evaluate(() => ({
  newWf: !!document.getElementById("btnNewWf2"),
  newProj: !!document.getElementById("btnNewProj"),
  nnAll: !!document.getElementById("btnNnAll"),
  cards: [...document.querySelectorAll("#wfGrid .wfcard[data-card]")].map(c => ({
    name: c.dataset.card, draggable: c.getAttribute("draggable") === "true", nn: !!c.querySelector("[data-nn]"),
    proj: (c.closest(".pfgroup") || {}).dataset ? c.closest(".pfgroup").dataset.proj : "",
  })),
}));
ok(distUi.newWf && distUi.newProj && distUi.nnAll, "分布工作区头部新增「＋新建画布 / ＋新建项目 / 🧠 全部加入神经网络」");
ok(distUi.cards.length >= 3, "分布工作区渲染出卡片（实际 " + distUi.cards.length + "）");
ok(distUi.cards.every(c => c.draggable), "所有卡片都可拖动（draggable=true）");
ok(distUi.cards.every(c => c.nn), "每张卡片都有 🧠 神经网络开关");

// —— 🧠 一键加入 / 移出神经网络：移出后该会话从神经网络里消失 ——
const nnToggle = await page.evaluate(async () => {
  const F = window.__flow;
  const before = F.nnTextState() ? F.nnTextState().stat.sess : 0;
  const name = F.wf().list.find(w => w.src && w.src.session && w.nnOn !== false).name;
  F.showView("nn"); F.renderNn(); await new Promise(r => setTimeout(r, 600));
  const mid = F.nnTextState().stat.sess;
  F.showView("dist"); F.toggleNnCard(name); await new Promise(r => setTimeout(r, 300));
  F.showView("nn"); F.renderNn(); await new Promise(r => setTimeout(r, 600));
  const off = F.nnTextState().stat.sess;
  F.showView("dist"); F.toggleNnCard(name); await new Promise(r => setTimeout(r, 300));
  F.showView("nn"); F.renderNn(); await new Promise(r => setTimeout(r, 600));
  const back = F.nnTextState().stat.sess;
  const flag = F.wf().list.find(w => w.name === name).nnOn;
  F.showView("dist"); await new Promise(r => setTimeout(r, 300));
  return { name: name, mid: mid, off: off, back: back, flag: flag };
});
ok(nnToggle.off === nnToggle.mid - 1, "「移出神经网络」后该会话从神经网络消失（" + nnToggle.mid + " → " + nnToggle.off + "）");
ok(nnToggle.back === nnToggle.mid, "再点一次可加回神经网络（" + nnToggle.back + "）");
ok(nnToggle.flag !== false, "加回后 nnOn 不再是 false");

// —— ＋新建项目 / 拖动改归属 / 拖动排序 / 删除空项目 ——
const proj = await page.evaluate(async () => {
  const F = window.__flow;
  window.prompt = () => "测验项目";                 // 绕开原生 prompt（headless 下默认返回 null）
  document.getElementById("btnNewProj").click();
  await new Promise(r => setTimeout(r, 300));
  const hasProj = (F.projects() || []).some(p => p.key === "测验项目");
  const emptyBox = !!document.querySelector('#wfGrid .pfgroup[data-proj="测验项目"]');
  const emptyHint = !!document.querySelector('#wfGrid .pfgroup[data-proj="测验项目"] .pfdrop');
  // 把第一张会话卡片拖到这个新项目下
  const card = F.wf().list.find(w => w.src && w.src.session);
  F.moveCard(card.name, "测验项目", "");
  await new Promise(r => setTimeout(r, 300));
  const moved = F.wf().list.find(w => w.name === card.name);
  const boxNow = document.querySelector('#wfGrid .pfgroup[data-proj="测验项目"]');
  const inBox = boxNow ? [...boxNow.querySelectorAll(".wfcard[data-card]")].map(e => e.dataset.card) : [];
  // 对话画布不允许拖到「流程框架」
  F.moveCard(card.name, "流程框架", "");
  await new Promise(r => setTimeout(r, 200));
  const afterRefuse = F.wf().list.find(w => w.name === card.name).proj;
  // 拖动排序：把第二张卡片排到第一张前面
  const others = F.wf().list.filter(w => w.src && w.src.session && w.name !== card.name && w.proj === "测验项目");
  let order = null;
  if (others.length){
    F.moveCard(others[0].name, "测验项目", card.name);
    await new Promise(r => setTimeout(r, 250));
    const c2 = F.wf().list.find(w => w.name === card.name);
    const o2 = F.wf().list.find(w => w.name === others[0].name);
    order = { card: c2.order, other: o2.order };
  }
  return { hasProj: hasProj, emptyBox: emptyBox, emptyHint: emptyHint, moved: moved.proj, movedOrder: moved.order,
    inBox: inBox, afterRefuse: afterRefuse, order: order, sessionCards: F.wf().list.filter(w => w.src && w.src.session).length };
});
ok(proj.hasProj, "「＋新建项目」把项目写进 WF.projects");
ok(proj.emptyBox && proj.emptyHint, "空项目也渲染成项目框，并提示「把画布卡片拖到这里」");
ok(proj.moved === "测验项目" && proj.movedOrder === 0, "拖动把卡片改归属到新项目并写入 order（proj=" + proj.moved + "，order=" + proj.movedOrder + "）");
ok(proj.inBox.indexOf(proj.inBox[0]) >= 0 && proj.inBox.length >= 1, "新项目框里出现被拖入的卡片（" + proj.inBox.length + " 张）");
ok(proj.afterRefuse === "测验项目", "对话画布拖到「流程框架」被拒绝（归属未变）");
if (proj.order) ok(proj.order.other < proj.order.card, "拖到某张卡片上可插到它前面（order " + proj.order.other + " < " + proj.order.card + "）");

const cleaned = await page.evaluate(async () => {
  const F = window.__flow;
  // 有画布的项目不显示 ✕（防止误删带走卡片）
  const hasXWhenFilled = !!document.querySelector('#wfGrid .pfgroup[data-proj="测验项目"] [data-delproj]');
  // 把拖进去的卡片移出（回到原项目），项目空了才出现 ✕ 按钮
  F.wf().list.forEach(w => { if (w.proj === "测验项目") delete w.proj; });
  F.renderDist();
  await new Promise(r => setTimeout(r, 300));
  const xAfterEmpty = !!document.querySelector('#wfGrid .pfgroup[data-proj="测验项目"] [data-delproj]');
  document.querySelectorAll('#wfGrid [data-delproj]').forEach(b => b.click());
  await new Promise(r => setTimeout(r, 300));
  return { hasXWhenFilled: hasXWhenFilled, xAfterEmpty: xAfterEmpty, keys: (F.projects() || []).map(p => p.key) };
});
ok(!cleaned.hasXWhenFilled, "非空项目不显示「✕ 删除项目」（不会误删带走卡片）");
ok(cleaned.xAfterEmpty, "项目空了才出现「✕ 删除项目」");
ok(cleaned.keys.indexOf("测验项目") < 0, "「✕ 删除项目」可删掉空项目（剩余：" + cleaned.keys.join(",") + "）");

// ---------- 收尾：汇总 + 释放浏览器（缺这段会让进程挂在打开的浏览器上不退出） ----------
if (errs.length) console.log("\n页面错误：\n  " + errs.slice(0, 8).join("\n  "));
console.log("\n" + pass + " passed, " + fail + " failed" + (errs.length ? " , " + errs.length + " page errors" : ""));
await page.close();
await browser.close();
process.exit(fail > 0 ? 1 : 0);
