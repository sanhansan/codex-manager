// 对着**实时服务**（http://127.0.0.1:8380）核对 v0.27.2 的四项修复是否真的在浏览器里生效
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OUT = process.env.NN_SHOTS_OUT || join(process.env.TEMP || ".", "cmflow-live-shots");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const root = join(process.env.LOCALAPPDATA, "ms-playwright");
let chrome = null;
for (const d of readdirSync(root)){ if (!/^chromium-/.test(d)) continue;
  for (const rel of ["chrome-win64/chrome.exe","chrome-win/chrome.exe"]){ const fp = join(root,d,rel); if (existsSync(fp)){ chrome = fp; break; } }
  if (chrome) break; }
const { chromium } = require("C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core");

const URL = "http://127.0.0.1:8380/flow-editor.html";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String(e && e.message || e)));
await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 20000 });
console.log("页面加载 OK（实时服务）");

// v0.27.6：本脚本会真的改动工作副本（连文件会切画布、写回会落盘），所以**先快照服务端工作流备份**，
// 跑完原样还原——否则测试自己的临时画布会留在用户的 wf-backup.json 里。
let wfSnapshot = null;
try {
  wfSnapshot = await page.evaluate(async () => {
    const j = await (await fetch("__flow_wf_state?_=" + Date.now(), { cache: "no-store" })).json();
    return (j && j.ok && j.exists) ? j.tree : null;
  });
} catch(e){}
console.log(wfSnapshot ? ("已快照服务端工作副本：" + ((wfSnapshot.list || []).length) + " 个画布") : "未能快照服务端工作副本（跳过还原）");

// 造一段「有真实问答」的会话画布，然后核对方框 / 连线 / 端口 / 神经网络
const rep = await page.evaluate(() => {
  const F = window.__flow, WF = F.wf();
  const name = "实时核对-" + Date.now();
  WF.list.push({
    name,
    data: { name, dir: "LR", nodes: [
      { id: "a1", x: 40, y: 40, w: 236, h: 60, label: "登录接口", kind: "agent", file: "LoginController.java" },
      { id: "a2", x: 380, y: 40, w: 236, h: 60, label: "限流", kind: "agent", file: "RateLimit.java" },
    ], edges: [{ from: "a1", to: "a2", label: "" }], subs: [] },
    src: { parent: "主流程", client: "zcode", session: "sess_" + name, task: "",
      ts: Date.now(), cwd: "C:/work/实时", project: "实时",
      turns: [{ node: "a1", q: "实现登录接口", ts: Date.now(), subs: [],
        a: "LoginController 接 /api/login，用 BCrypt 校验密码后签发 Sa-Token，失败返回 401。" }] },
  });
  F.switchWorkflow(name);
  const gg = F.g();
  gg._docsFilled = false;
  F.enrichNodeDocs();
  gg.nodes.forEach(F.sizeNode);
  F.refresh(true);
  const cards = gg.nodes.map(n => ({ id: n.id, h: n.h, rows: (n.bodyRows || []).length,
    text: (n.bodyRows || []).join(" "), fileLabel: n.fileLabel }));
  // 连线：造一条被挡的边核对避让
  gg.nodes.push({ id: "a3", x: 720, y: 260, w: 236, h: 60, label: "审计", kind: "output", doc: "log" });
  gg.edges.push({ from: "a1", to: "a3", label: "" });
  gg.nodes.forEach(F.sizeNode);
  F.refresh(true);
  const metas = F.edgeMeta(gg);
  const ep = F.edgePath(gg.edges[gg.edges.length - 1], metas[metas.length - 1]);
  const inn = F.anchors(gg.nodes.find(n => n.id === "a3")).inn;
  const nums = String(ep.d).match(/-?\d+(\.\d+)?/g) || [];
  const pts = []; for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: +nums[k], y: +nums[k + 1] });
  const tip = pts[pts.length - 1];
  const blocker = gg.nodes.find(n => n.id === "a2");
  const inside = pts.filter(p => p.x > blocker.x + 2 && p.x < blocker.x + blocker.w - 2
    && p.y > blocker.y + 2 && p.y < blocker.y + blocker.h - 2).length;
  // 端口：可见圆分 in/out，热区存在
  const g1 = document.querySelector('g[data-node="a1"]');
  const ports = g1 ? {
    inCircle: g1.querySelectorAll("circle.port-in").length,
    outCircle: g1.querySelectorAll("circle.port-out").length,
    hit: g1.querySelectorAll("circle.port-hit[data-port]").length,
    hitR: g1.querySelector("circle.port-hit") ? +g1.querySelector("circle.port-hit").getAttribute("r") : 0,
  } : null;
  // 神经网络：真实问答是否进去
  F.showView("nn");
  const st = F.nnTextState();
  const turns = st.rects.filter(r => r.kind === "turn" && Array.isArray(r.lines));
  const all = []; turns.forEach(r => r.lines.forEach(l => all.push(String(l))));
  const bySess = {};
  turns.forEach(r => { const k = r.sessId || "?"; (bySess[k] = bySess[k] || []).push(...r.lines.map(String)); });
  const dups = Object.keys(bySess).map(k => bySess[k].length - new Set(bySess[k]).size);
  return { cards, edge: { insideBlocker: inside, tipDist: Math.round(Math.hypot(tip.x - inn.x, tip.y - inn.y) * 10) / 10 },
    ports, nn: { total: all.length, maxDupInSess: dups.length ? Math.max.apply(null, dups) : 0,
      joined: all.join("\n") } };
});

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("ok  -", m)) : (fail++, console.log("FAIL-", m)); };

for (const c of rep.cards) console.log("卡片", JSON.stringify(c));
ok(rep.cards.every(c => c.h < 600), "卡片高度正常（无字符数当行数导致的巨框）");
ok(rep.cards.some(c => /BCrypt|Sa-Token|\/api\/login/.test(c.text)), "卡片正文写入真实回答内容");
ok(rep.cards.every(c => c.text.indexOf(c.id) < 0), "卡片正文不是把标题/ID 重复一遍");
ok(rep.edge.insideBlocker === 0, "连线折点不落在挡路卡片内部（实际 " + rep.edge.insideBlocker + "）");
ok(rep.edge.tipDist >= 6, "箭头尖停在端口外侧（距端口 " + rep.edge.tipDist + "px）");
ok(rep.ports && rep.ports.inCircle === 1 && rep.ports.outCircle === 1, "端口分输入/输出两种样式");
ok(rep.ports && rep.ports.hit === 2 && rep.ports.hitR >= 8, "端口热区存在且足够大（r=" + (rep.ports ? rep.ports.hitR : 0) + "）");
ok(rep.nn.total >= 4, "神经网络正文有文字行（实际 " + rep.nn.total + "）");
ok(rep.nn.maxDupInSess === 0, "同一会话内无重复行（最大重复 " + rep.nn.maxDupInSess + "）");
ok(/BCrypt|Sa-Token|LoginController/.test(rep.nn.joined), "神经网络写入具体问答（不是重复标题）");

// ========== v0.27.6 后台文件检测 + 下拉选择连接正在改动的文件（全程用临时草稿文件，不碰真实文件）==========
const SCRATCH = "_verify-live-scratch.mmd";
const SCRATCH_MERMAID = ["flowchart LR", '  s1["草稿起点"]', '  s2["草稿终点"]', "  s1 --> s2"].join("\n");
let liveFile = null;
try {
  // 1) 用「按路径写回」接口造一个草稿文件（同时也是对 /__flow_write_path 的验证）
  const w0 = await page.evaluate(async ([rel, txt]) => {
    const r = await fetch("__flow_write_path", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rel, text: txt }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [SCRATCH, SCRATCH_MERMAID]);
  ok(w0.status === 200 && w0.body && w0.body.ok, "/__flow_write_path 可写服务根目录内的相对路径");

  const guard = await page.evaluate(async () => {
    const post = async path => (await fetch("__flow_write_path", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path, text: "x" }) })).status;
    return { up: await post("../../../evil.txt"), abs: await post("C:/Windows/win.ini") };
  });
  ok(guard.up === 400, "越界相对路径（../../../）被拒绝（HTTP " + guard.up + "）");
  ok(guard.abs === 400, "白名单外绝对路径被拒绝（HTTP " + guard.abs + "）");

  // 2) 重新检测 → 下拉里应出现这个刚改动过的文件
  await page.evaluate(() => document.getElementById("btnFileRefresh").click());
  await page.waitForTimeout(900);
  const selState = await page.evaluate(rel => {
    const sel = document.getElementById("fileSel");
    if (!sel) return null;
    const hit = [...sel.options].some(o => o.value === rel);
    sel.value = rel;
    return { n: sel.options.length - 1, hit: hit, title: sel.title, hasBtn: !!document.getElementById("btnFileConn") };
  }, SCRATCH);
  ok(selState && selState.hasBtn, "工具栏存在「🔗 连接选中文件」按钮");
  ok(selState && selState.n >= 1, "「正在改动中的文件」下拉检测到文件（" + (selState ? selState.n : 0) + " 个）");
  ok(selState && selState.hit, "刚写下的草稿文件出现在下拉里");
  ok(selState && /最近改动的文件/.test(selState.title || ""), "下拉 title 显示检测结果与根目录");

  // 3) 连接它 → 画布应载入草稿内容
  await page.evaluate(() => document.getElementById("btnFileConn").click());
  await page.waitForTimeout(1200);
  const afterConn = await page.evaluate(() => ({
    counts: window.__flow.counts(),
    status: (document.getElementById("syncStat") || {}).textContent || "",
    sync: window.__flow.sync(),
  }));
  ok(afterConn.counts.nodes === 2, "连接后画布载入草稿的 2 个节点（实际 " + afterConn.counts.nodes + "）");
  ok(afterConn.sync && afterConn.sync.mode === "http-rw", "进入 HTTP 双向同步模式（mode=" + (afterConn.sync && afterConn.sync.mode) + "）");
  ok(new RegExp(SCRATCH).test(afterConn.status) || new RegExp(SCRATCH).test((afterConn.sync && afterConn.sync.name) || ""), "状态栏显示已连接的草稿文件");

  // 4) 改画布 → 应自动写回草稿文件
  await page.evaluate(() => {
    const F = window.__flow, gg = F.g();
    gg.nodes.push({ id: "s3", label: "写回验证", shape: "rect", sub: null, gate: "", subflow: "", kind: "agent", doc: "", x: 300, y: 0, w: 0, h: 0 });
    F.refresh(false);
    F.saveAll ? F.saveAll() : null;
  });
  await page.evaluate(() => { const b = document.getElementById("btnAdd"); if (b) b.click(); });
  await page.waitForTimeout(2200);
  liveFile = await page.evaluate(async rel => (await (await fetch(rel + "?_=" + Date.now(), { cache: "no-store" })).text()), SCRATCH);
  ok(/写回验证|新节点/.test(liveFile), "画布改动自动写回了正在改动的文件（HTTP 双向同步生效）");
} catch(e){
  ok(false, "文件检测/连接链路抛异常：" + ((e && e.message) || e));
} finally {
  // 清理草稿文件（内容清空成空串，等价于删除）
  try { await page.evaluate(async rel => { await fetch("__flow_write_path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: rel, text: "" }) }); }, SCRATCH); } catch(e){}
}

// ========== v0.27.8 服务端「缩水保护」：画布数量骤降必须被拒（除非带 force） ==========
try {
  const g409 = await page.evaluate(async () => {
    const cur = await (await fetch("__flow_wf_state?_=" + Date.now(), { cache: "no-store" })).json();
    const tree = cur && cur.tree;
    if (!tree || !Array.isArray(tree.list)) return { skip: true };
    const n = tree.list.length;
    const tiny = Object.assign({}, tree, { list: tree.list.slice(0, 1) });
    const oneLess = Object.assign({}, tree, { list: tree.list.slice(0, Math.max(0, n - 1)) });
    const post = async (t, force, baseRev) => {
      const body = { tree: t };
      if (force !== undefined) body.force = force;
      if (baseRev !== undefined) body.baseRev = baseRev;
      const r = await fetch("__flow_wf_state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const bad = await post(tiny);                             // 65 → 1，必须被拒
    const bad2 = await post(tiny, false);                     // 显式 force:false 同样拒绝
    const bad3 = await post(oneLess);                         // 只少 1 个也必须拒绝（实测 35% 阈值拦不住 65→62）
    const good = await post(tree, true);                      // 原样回传 + force → 放行（同时盖出新的 srvRev）
    const stale = await post(tree, undefined, "deadbeef");    // baseRev 与服务端不符 → 视为陈旧页面
    const after = await (await fetch("__flow_wf_state?_=" + Date.now(), { cache: "no-store" })).json();
    return { n: n, skip: false, bad: bad.status, bad2: bad2.status, bad3: bad3.status,
      stale: stale.status, staleFlag: !!(stale.body && stale.body.stale),
      good: good.status, rev: (good.body && good.body.rev) || "",
      srvRev: ((after.tree || {}).srvRev) || "",
      msg: (bad.body && bad.body.error) || "", after: ((after.tree || {}).list || []).length };
  });
  if (g409.skip) ok(false, "缩水保护：拿不到服务端工作副本，无法校验");
  else {
    ok(g409.bad === 409, "画布数量骤降被服务端拒绝（HTTP " + g409.bad + "，现有 " + g409.n + " 个）");
    ok(g409.bad2 === 409, "force:false 同样被拒绝（HTTP " + g409.bad2 + "）");
    ok(g409.bad3 === 409, "只少 1 个画布也被拒绝（HTTP " + g409.bad3 + "，35% 阈值拦不住的形态）");
    ok(g409.stale === 409 && g409.staleFlag, "baseRev 与服务端不符 → 判定为陈旧页面并拒绝（HTTP " + g409.stale + "）");
    ok(g409.good === 200, "原样回传并带 force=true 时正常写入（HTTP " + g409.good + "）");
    ok(!!g409.rev && g409.rev === g409.srvRev, "每次写入都会盖新的 srvRev 并回给客户端（" + g409.rev + "）");
    ok(g409.after === g409.n, "被拒绝后工作副本没被改动（仍为 " + g409.after + " 个画布）");
    ok(/拒绝覆盖|防误删/.test(g409.msg), "拒绝时返回可读的中文原因（" + String(g409.msg).slice(0, 30) + "…）");
  }
} catch(e){ ok(false, "缩水保护校验抛异常：" + ((e && e.message) || e)); }

const fp = join(OUT, "live-verify.png");
await page.waitForTimeout(600);
await page.screenshot({ path: fp });
console.log("shot:", fp);
// 还原服务端工作副本快照（必须在关闭浏览器前做）
if (wfSnapshot){
  try {
    const back = await page.evaluate(async tree => {
      // v0.27.8：还原是确定性写入，带 force 跳过「减少即拒绝 / baseRev 过期」两道闸门
      const r = await fetch("__flow_wf_state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tree: tree, force: true }) });
      const j = await r.json().catch(() => null);
      return { status: r.status, ok: !!(j && j.ok) };
    }, wfSnapshot);
    console.log("已还原服务端工作副本快照：", back.ok ? "ok" : ("失败 HTTP " + back.status));
  } catch(e){ console.log("还原快照失败：", (e && e.message) || e); }
}
console.log("页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
console.log("\n" + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
