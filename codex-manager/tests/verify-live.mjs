// 对着**实时服务**（http://127.0.0.1:8380）核对 v0.27.2 的四项修复是否真的在浏览器里生效
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OUT = "C:/Users/35446/WorkBuddy/2026-10-08-01-51-18/nn-shots";
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

const fp = join(OUT, "live-verify.png");
await page.waitForTimeout(600);
await page.screenshot({ path: fp });
console.log("shot:", fp);
console.log("页面错误:", errs.length ? errs.slice(0, 4).join(" | ") : "none");
console.log("\n" + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
