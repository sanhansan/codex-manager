// v0.27.4 端到端验证：画布「左右连接节点」与「非门」+ 左右常驻连接点 + 神经网络新增能力
//   覆盖：工具栏新按钮 / 非门类型与默认门 / 连接符落位与自动接线 / 连接符端口恒左右 /
//         普通节点四连接点 / 连接符两连接点 / mermaid 往返 / 非门校验 / 神经网络层级显隐与角色分布
// 无头 Chromium 直开 flow-editor.html（离线可跑）；环境缺 playwright-core / Chromium 时优雅跳过。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "..", "assets", "flow-editor.html");
const require = createRequire(import.meta.url);

function resolvePlaywright(){
  const c = [];
  try { c.push(require.resolve("playwright-core")); } catch(e){}
  for (const p of [process.env.PLAYWRIGHT_CORE,
    "C:/Users/35446/.workbuddy/binaries/node/workspace/node_modules/playwright-core",
    join(process.env.USERPROFILE || "", ".workbuddy", "binaries", "node", "workspace", "node_modules", "playwright-core")]) if (p) c.push(p);
  return c.find(p => p && existsSync(p)) || null;
}
function resolveChromium(){
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null].filter(Boolean);
  for (const root of roots){
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)){
      if (!/^chromium-/.test(d)) continue;
      for (const rel of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome"]){
        const fp = join(root, d, rel);
        if (existsSync(fp)) return fp;
      }
    }
  }
  return null;
}
const pwPath = resolvePlaywright(), chrome = resolveChromium();
if (!pwPath || !chrome){
  console.log("SKIP - 端到端测试需要 playwright-core 与 Chromium：", pwPath || "无 playwright-core", "/", chrome || "无 chromium");
  process.exit(0);
}
const { chromium } = require(pwPath);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c){ console.log("ok  -", m); pass++; } else { console.error("FAIL-", m); fail++; } };

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String((e && e.message) || e)));
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 15000 });

// ---------- 1) 工具栏：三个新按钮都在（左连接 / 右连接 / 非门） ----------
const btns = await page.evaluate(() => ({
  linkIn: !!document.querySelector('#cvTools [data-add="link-in"]'),
  linkOut: !!document.querySelector('#cvTools [data-add="link-out"]'),
  not: !!document.querySelector('#cvTools [data-add="not"]'),
  texts: [...document.querySelectorAll("#cvTools [data-add]")].map(b => b.textContent.trim()),
}));
ok(btns.linkIn && btns.linkOut && btns.not, "画布工具栏新增「＋左连接 / ＋右连接 / ＋非门」三个按钮");
ok(btns.texts.some(t => /左连接/.test(t)) && btns.texts.some(t => /右连接/.test(t)) && btns.texts.some(t => /非门/.test(t)),
  "按钮文案正确：" + btns.texts.filter(t => /连接|非门/.test(t)).join(" / "));

// ---------- 2) 造一段 LR 小流程，再依次插入 非门 / 左连接 / 右连接 ----------
const built = await page.evaluate(() => {
  const F = window.__flow, gg = F.g();
  gg.nodes.length = 0; gg.edges.length = 0; gg.subs.length = 0;
  const mk = (id, label, kind, shape) => ({ id, label, shape: shape || "rect", sub: null, gate: "", subflow: "", kind, doc: "", x: 0, y: 0, w: 0, h: 0 });
  gg.nodes.push(mk("p0", "需求", "input", "round"), mk("p1", "实现", "agent"), mk("p2", "通过?", "cond", "diamond"));
  gg.edges.push({ from: "p0", to: "p1", label: "", style: "solid" }, { from: "p1", to: "p2", label: "", style: "solid" });
  document.getElementById("btnLayout").click();
  const click = k => document.querySelector('#cvTools [data-add="' + k + '"]').click();
  click("not"); click("link-in"); click("link-out");
  const g2 = F.g();
  const byId = id => g2.nodes.find(n => n.id === id);
  const notN = g2.nodes.find(n => n.kind === "not");
  const lIn = g2.nodes.find(n => n.kind === "link-in");
  const lOut = g2.nodes.find(n => n.kind === "link-out");
  const minX = Math.min.apply(null, g2.nodes.filter(n => n.kind !== "link-in").map(n => n.x));
  const maxR = Math.max.apply(null, g2.nodes.filter(n => n.kind !== "link-out").map(n => n.x + n.w));
  return {
    not: notN ? { kind: notN.kind, gate: notN.gate, shape: notN.shape, label: notN.label } : null,
    lIn: lIn ? { w: lIn.w, h: lIn.h, x: lIn.x, right: lIn.x + lIn.w } : null,
    lOut: lOut ? { w: lOut.w, h: lOut.h, x: lOut.x } : null,
    minX, maxR,
    inEdges: g2.edges.filter(e => e.from === (lIn && lIn.id)).map(e => e.to),
    outEdges: g2.edges.filter(e => e.to === (lOut && lOut.id)).map(e => e.from),
    aLIn: lIn ? F.anchors(lIn, "TD") : null, aLOut: lOut ? F.anchors(lOut, "TD") : null,
    aLInLR: lIn ? F.anchors(lIn, "LR") : null,
    sideCountNormal: (function(){
      const el = document.querySelector('#cv [data-node="' + (byId("p1") || {}).id + '"]');
      return el ? { side: el.querySelectorAll("circle.port-side").length, hit: el.querySelectorAll("circle.port-hit").length } : null;
    })(),
    sideCountLink: (function(){
      const el = document.querySelector('#cv [data-node="' + (lIn || {}).id + '"]');
      return el ? { side: el.querySelectorAll("circle.port-side").length, hit: el.querySelectorAll("circle.port-hit").length } : null;
    })(),
    dirForLink: lIn ? F.edgeDirOf(lIn, byId("p0")) : null,
    mermaid: (function(){ const t = F.tabs && F.tabs.mermaid; return null; })(),
  };
});
ok(!!built.not, "点「＋非门」成功插入节点");
ok(built.not && built.not.kind === "not" && built.not.gate === "NOT", "非门节点 kind=not 且自动带 NOT 门（实际 " + (built.not && built.not.gate) + "）");
ok(built.not && built.not.shape === "round", "非门默认圆角形状（实际 " + (built.not && built.not.shape) + "）");
ok(built.lIn && built.lIn.w === 54 && built.lIn.h === 54, "左连接符是小圆尺寸 54×54（实际 " + (built.lIn && built.lIn.w) + "）");
ok(built.lIn && built.lIn.right <= built.minX, "左连接符落在现有内容最左侧（符右边 " + (built.lIn && built.lIn.right) + " ≤ 内容最左 " + built.minX + "）");
ok(built.lOut && built.lOut.x >= built.maxR, "右连接符落在现有内容最右侧（符左边 " + (built.lOut && built.lOut.x) + " ≥ 内容最右 " + built.maxR + "）");
ok(built.inEdges.indexOf("p0") >= 0, "左连接符自动接上了入口节点 p0（实际接 " + built.inEdges.join(",") + "）");
ok(built.outEdges.indexOf("p2") >= 0, "右连接符自动接上了出口节点 p2（实际接 " + built.outEdges.join(",") + "）");
ok(built.inEdges.indexOf("n1") < 0 && built.inEdges.length === 1, "孤立悬空的非门节点不会被误接（只接「还能往下走」的入口）");

// ---------- 3) 连接符端口恒左右（与整体方向无关） ----------
ok(built.aLIn && built.aLIn.out.x > built.aLIn.inn.x && built.aLIn.out.y === built.aLIn.inn.y,
  "连接符输出端口在右、输入端口在左，且同高（与 g.dir 无关）");
ok(built.aLInLR && built.aLInLR.out.x === built.aLIn.out.x, "连接符在 TD / LR 下端口一致（恒定左右）");
ok(built.sideCountNormal && built.sideCountNormal.side === 2 && built.sideCountNormal.hit === 4,
  "普通节点在 TD 图里同时渲染「上下主端口 + 左右常驻连接点」（侧点 " + (built.sideCountNormal && built.sideCountNormal.side) + "，热区 " + (built.sideCountNormal && built.sideCountNormal.hit) + "）");
ok(built.sideCountLink && built.sideCountLink.side === 0 && built.sideCountLink.hit === 2,
  "连接符只用左右两个端口（侧点 0、热区 2）");
ok(built.dirForLink === "LR", "与连接符相连的边一律走左右端口（edgeDirOf → " + built.dirForLink + "）");

// ---------- 4) mermaid 往返：kind 不丢 ----------
const round = await page.evaluate(async () => {
  const F = window.__flow;
  F.setTab("mermaid");
  const txt = document.getElementById("codeTA").value || "";
  F.applyText(txt, "mermaid");          // 用导出的 mermaid 重新解析
  await new Promise(r => setTimeout(r, 200));
  const gg = F.g();
  return {
    kinds: gg.nodes.map(n => n.id + ":" + n.kind).sort(),
    gates: gg.nodes.filter(n => n.gate).map(n => n.id + ":" + n.gate).sort(),
    hasLinkRows: /link-in|link-out/.test(txt),
  };
});
ok(round.kinds.some(s2 => /:link-in$/.test(s2)) && round.kinds.some(s2 => /:link-out$/.test(s2)) && round.kinds.some(s2 => /:not$/.test(s2)),
  "mermaid 导出→再解析仍保留三种新类型：" + round.kinds.join(" "));
ok(round.gates.some(s2 => /:NOT$/.test(s2)), "非门的 NOT 门也随 mermaid 往返保留（" + round.gates.join(" ") + "）");

// ---------- 5) 非门校验：0 输入报错 ----------
const gateIssues = await page.evaluate(async () => {
  const F = window.__flow, gg = F.g();
  const nn = gg.nodes.find(n => n.kind === "not");
  if (!nn) return null;
  // 临时摘掉非门的输入连线，再点「校验流程」按钮（走真实 UI 路径）
  const backup = gg.edges.slice();
  gg.edges = backup.filter(e => e.to !== nn.id);
  F.refresh(false);
  document.getElementById("tabAI").click();
  document.getElementById("btnValidate").click();
  await new Promise(r => setTimeout(r, 200));
  const out = (document.getElementById("aiOut") || {}).textContent || "";
  gg.edges = backup.slice();
  F.refresh(false);
  return { nnId: nn.id, out: out };
});
ok(gateIssues && /NOT/.test(gateIssues.out) && /1 个输入/.test(gateIssues.out),
  "非门规则生效：输入数不等于 1 时校验报错（" + ((gateIssues && gateIssues.out) || "").replace(/\s+/g, " ").slice(0, 80) + "）");

// ---------- 5b) v0.27.5 是否等判断：判断块 + 判断词 + 边标签胶囊 + 校验 ----------
const br = await page.evaluate(async () => {
  const F = window.__flow, gg = F.g();
  gg.nodes.length = 0; gg.edges.length = 0; gg.subs.length = 0;
  F.refresh(true);
  const sel = document.getElementById("branchSel");
  const btn = document.getElementById("btnBranch");
  const opts = sel ? [...sel.options].map(o => ({ v: o.value, t: o.textContent.trim() })) : [];
  // ① 默认（是/否）插一个判断块
  sel.value = "yn"; btn.click();
  const after1 = { nodes: F.g().nodes.map(n => ({ id: n.id, kind: n.kind, shape: n.shape, gate: n.gate, label: n.label })),
    edges: F.g().edges.map(e => e.from + "->" + e.to + "|" + e.label) };
  // ② 切到「真/假」再插一个
  sel.value = "tf"; btn.click();
  const after2 = { nodes: F.g().nodes.length, edges: F.g().edges.map(e => e.label) };
  // ③ 复位到 是/否，供后面校验用
  sel.value = "yn";
  return { hasSel: !!sel, hasBtn: !!btn, opts, after1, after2,
    pairLabels: F.branchLabels("yn", false), words: F.BRANCH_PAIRS().length };
});
ok(br.hasSel && br.hasBtn, "工具栏新增「判断词」下拉 + 「＋判断」按钮");
ok(br.opts.length === 5, "判断词下拉有 5 组（是/否、真/假、通过/不通过、成功/失败、有/无）（实际 " + br.opts.length + "）");
ok(br.opts.map(o => o.v).join(",") === "yn,tf,pass,ok,has", "判断词选项顺序与预设一致：" + br.opts.map(o => o.t).join(" / "));
ok(br.pairLabels.join("|") === "是|否", "默认判断词是「是 / 否」（实际 " + br.pairLabels.join("|") + "）");

const b1 = br.after1;
const conds = b1.nodes.filter(n => n.kind === "cond");
ok(conds.length === 1 && conds[0].shape === "diamond" && conds[0].gate === "IF",
  "＋判断 插入了 1 个菱形条件节点且自带 IF 门（实际 " + JSON.stringify(conds[0]) + "）");
ok(b1.nodes.length === 3, "＋判断 一次插入 3 个节点（判断 + 两个分支）（实际 " + b1.nodes.length + "）");
const b1Edges = b1.edges.map(e => e.split("|")[1]);
ok(b1Edges.length === 2 && b1Edges.indexOf("是") >= 0 && b1Edges.indexOf("否") >= 0,
  "两条分支连线已自动标注 是 / 否（实际 " + b1Edges.join(" / ") + "）");
const froms = b1.edges.map(e => e.split("->")[0].split("|")[0]);
ok(new Set(froms).size === 1 && froms[0] === conds[0].id, "两条分支都从判断节点射出");
ok(br.after2.edges.filter(l => l === "真").length === 1 && br.after2.edges.filter(l => l === "假").length === 1,
  "切到「真 / 假」再插，新分支标注为 真 / 假（全部标签：" + br.after2.edges.join("/") + "）");

// 边属性面板的判断词快捷胶囊：点「通过」→ 该边标签变为「通过」
const chipRes = await page.evaluate(async () => {
  const F = window.__flow;
  F.setSel({ type: "edge", id: 0 });
  await new Promise(r => setTimeout(r, 120));
  const box = document.getElementById("props");
  const chips = [...box.querySelectorAll(".bchip[data-w]")].map(b => b.textContent.trim());
  const before = F.g().edges[0].label;
  const target = box.querySelector('.bchip[data-w="通过"]');
  if (target) target.click();
  await new Promise(r => setTimeout(r, 120));
  const after = F.g().edges[0].label;
  const onNow = [...box.querySelectorAll(".bchip.on")].map(b => b.textContent.trim());
  return { chips: chips, before: before, after: after, onNow: onNow };
});
ok(chipRes.chips.length >= 11, "边属性面板出现判断词快捷胶囊（实际 " + chipRes.chips.length + " 个，含清空）");
ok(chipRes.chips.indexOf("通过") >= 0 && chipRes.chips.indexOf("不通过") >= 0, "胶囊覆盖「通过 / 不通过」");
ok(chipRes.before === "是" && chipRes.after === "通过", "点击胶囊即把边标签改成「通过」（" + chipRes.before + " → " + chipRes.after + "）");
ok(chipRes.onNow.indexOf("通过") >= 0, "当前标签对应的胶囊高亮");

// 校验：把两条分支改成「是 / 真」（不是一对）→ 走真实「校验流程」按钮
const brIssues = await page.evaluate(async () => {
  const F = window.__flow, gg = F.g();
  // 找到第一个判断节点的两条出边
  const q = gg.nodes.find(n => n.kind === "cond" && n.gate === "IF");
  const outs = gg.edges.filter(e => e.from === q.id);
  outs[0].label = "是"; outs[1].label = "真";
  F.refresh(false);
  document.getElementById("tabAI").click();
  document.getElementById("btnValidate").click();
  await new Promise(r => setTimeout(r, 200));
  const out = (document.getElementById("aiOut") || {}).textContent || "";
  // 修回一对，再校验一次应无「一对判断词」提示
  outs[0].label = "是"; outs[1].label = "否";
  F.refresh(false);
  document.getElementById("btnValidate").click();
  await new Promise(r => setTimeout(r, 200));
  const out2 = (document.getElementById("aiOut") || {}).textContent || "";
  return { bad: out, good: out2 };
});
ok(/一对判断词/.test(brIssues.bad), "校验能识别「是 / 真」不是一对并提示（" + brIssues.bad.replace(/\s+/g, " ").slice(0, 70) + "）");
ok(!/一对判断词/.test(brIssues.good), "改回「是 / 否」后不再提示");

// ---------- 5c) v0.27.7 连线去重叠（共走廊的交叉连线必须错开） ----------
const lanes = await page.evaluate(async () => {
  const F = window.__flow, gg = F.g();
  gg.nodes.length = 0; gg.edges.length = 0; gg.subs.length = 0;
  // 经典重叠场景：左上→右下 与 左下→右上 两条交叉连线，LR 下中间通道会完全重合
  const mk = (id, x, y, label) => ({ id, label, shape: "rect", sub: null, gate: "", subflow: "", kind: "agent", doc: "", x, y, w: 236, h: 60 });
  gg.nodes.push(mk("A", 0, 0, "A 左上"), mk("B", 0, 260, "B 左下"),
                mk("C", 520, 0, "C 右上"), mk("D", 520, 260, "D 右下"));
  gg.edges.push({ from: "A", to: "D", label: "", style: "solid" });
  gg.edges.push({ from: "B", to: "C", label: "", style: "solid" });
  gg.dir = "LR";
  if (document.getElementById("dirSel")) document.getElementById("dirSel").value = "LR";
  F.refresh(true);
  await new Promise(r => setTimeout(r, 300));
  const ds = [...document.querySelectorAll("#cv path.eg")].map(pl => pl.getAttribute("d"));
  // 直接从 d 解析「在曲线上的顶点」（M/L 各一点，Q 取终点、跳过控制点）
  const vertsOf = d => {
    const nums = String(d).match(/-?\d+(?:\.\d+)?/g).map(Number);
    const out = [];
    let i = 0;
    // M/L 各 1 对；Q 有 2 对（控制点 + 终点），只收终点
    const cmds = String(d).match(/[MLQ]/g) || [];
    cmds.forEach(c => {
      if (c === 'Q'){ i += 2; out.push([nums[i], nums[i + 1]]); i += 2; }
      else { out.push([nums[i], nums[i + 1]]); i += 2; }
    });
    return out;
  };
  const segsOf = vs => { const o = []; for (let i = 1; i < vs.length; i++) o.push({ x1: vs[i-1][0], y1: vs[i-1][1], x2: vs[i][0], y2: vs[i][1] }); return o; };
  // 两条线段若同向且共线（横向共 y / 纵向共 x，容差 1.5px），返回它们重叠的长度
  const overlapLen = (a, b) => {
    const ah = Math.abs(a.y1 - a.y2) < 1, bh = Math.abs(b.y1 - b.y2) < 1;
    if (ah && bh){
      if (Math.abs(a.y1 - b.y1) > 1.5) return 0;
      return Math.max(0, Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)));
    }
    const av = Math.abs(a.x1 - a.x2) < 1, bv = Math.abs(b.x1 - b.x2) < 1;
    if (av && bv){
      if (Math.abs(a.x1 - b.x1) > 1.5) return 0;
      return Math.max(0, Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)));
    }
    return 0;
  };
  const S0 = segsOf(vertsOf(ds[0])), S1 = segsOf(vertsOf(ds[1]));
  let overlaps = 0, worst = 0;
  for (const a of S0) for (const b of S1){ const L = overlapLen(a, b); if (L > 1){ overlaps++; worst = Math.max(worst, L); } }
  const paths = [...document.querySelectorAll("#cv path.eg")];
  const channelX = i => {
    const vs = vertsOf(ds[i]).filter((v, k, arr) => k > 0 && Math.abs(v[0] - arr[k-1][0]) < 1);
    if (!vs.length) return null;
    vs.sort((x, y) => x[0] - y[0]);
    return Math.round(vs[vs.length >> 1][0] * 10) / 10;
  };
  const chans = [channelX(0), channelX(1)];
  return {
    nEdges: ds.length, overlaps: overlaps, worst: Math.round(worst * 10) / 10, chans: chans,
    gap: (chans[0] != null && chans[1] != null) ? Math.abs(chans[0] - chans[1]) : null,
    plan: F.planLanes([{ i: 0, dir: "LR", ch: 378, lo: 30, hi: 230 }, { i: 1, dir: "LR", ch: 378, lo: 30, hi: 230 }], 26, 8),
  };
});
ok(lanes.nEdges === 2, "两条交叉连线都画出来了（实际 " + lanes.nEdges + "）");
ok(lanes.gap != null && lanes.gap >= 12, "共走廊的交叉连线各走各的竖向通道（间距 " + (lanes.gap == null ? "未测到" : lanes.gap.toFixed(1) + "px") + "）");
ok(lanes.overlaps === 0, "两条连线没有任何一段共线压在一起（重叠线段 " + lanes.overlaps + " 对，最长 " + lanes.worst + "px）");
ok(lanes.plan && lanes.plan[0] && lanes.plan[1] && lanes.plan[0].laneIdx !== lanes.plan[1].laneIdx && lanes.plan[0].laneCnt === 2,
  "planLanes 把共走廊的两条线分到不同分道（" + JSON.stringify(lanes.plan) + "）");

// —— 输入输出胶囊：点击跳转 + 选中 + 居中 + 高亮 ——
const jump = await page.evaluate(async () => {
  const F = window.__flow;
  const before = { x: F.view().x, y: F.view().y, sel: F.sel() };
  const pills = [...document.querySelectorAll("#cv .io-tag-g[data-jump]")];
  const target = pills.find(p => p.getAttribute("data-jump") === "C") || pills[0];
  const jumpId = target ? target.getAttribute("data-jump") : null;
  const act = target ? target.getAttribute("class") : "";
  const bg = target ? !!target.querySelector("rect.io-bg") : false;
  if (target) target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 420));
  const node = F.g().nodes.find(n => n.id === jumpId);
  const el = document.querySelector('#cv [data-node="' + jumpId + '"]');
  const r = document.getElementById("cv").getBoundingClientRect();
  const cx = F.view().x + (node.x + node.w / 2) * F.view().z;
  const cy = F.view().y + (node.y + node.h / 2) * F.view().z;
  return {
    n: pills.length, jumpId: jumpId, act: act, bg: bg,
    sel: F.sel(), moved: (F.view().x !== before.x || F.view().y !== before.y),
    centeredX: Math.abs(cx - r.width / 2) < 24, centeredY: Math.abs(cy - r.height * 0.42) < 24,
    flashed: el ? el.classList.contains("nd-flash") : false,
  };
});
ok(jump.n >= 3, "每个节点都有可点击的输入/输出胶囊（实际 " + jump.n + " 个）");
ok(jump.bg && /io-tag-g/.test(jump.act), "胶囊是带底板的可点击元素（不是纯文字）");
ok(jump.jumpId === "C", "点「指向 C」的胶囊拿到正确的跳转目标");
ok(jump.sel && jump.sel.type === "node" && jump.sel.id === "C", "跳转后选中了目标节点（属性面板同步）");
ok(jump.moved && jump.centeredX && jump.centeredY, "跳转把目标节点移到视口中央（偏移已校正）");
ok(jump.flashed, "跳转后目标节点高亮闪烁（nd-flash）");

// ---------- 6) 神经网络新增：层级显隐 / 角色分布 / 导出按钮 ----------
const nnNew = await page.evaluate(async () => {
  const F = window.__flow, WF = F.wf(), NOW = Date.now(), H = 3600000;
  const mk = (name, client, ts, turns) => ({
    name, data: { name, dir: "LR", nodes: [{ id: "n1", x: 0, y: 0, w: 236, h: 70, label: name, kind: "agent" }], edges: [], subs: [] },
    src: { parent: WF.active, client, session: "sess_" + name, task: name, ts, cwd: "C:/w/体测", project: "体测", turns },
  });
  WF.list.push(mk("评测", "qoder", NOW - 3 * H, [
    { node: "n1", q: "实现规则库", ts: NOW - 3 * H, subs: [], a: "RULES 按 code 索引，piecewise 取分段阈值。" },
  ]));
  WF.list.push(mk("导入", "zcode", NOW - 1 * H, [
    { node: "n1", q: "EasyExcel 批量导入", ts: NOW - 1 * H, subs: [], a: "每批 1000 条 + 单事务，失败整批回滚。" },
  ]));
  F.showView("nn"); F.renderNn();
  await new Promise(r => setTimeout(r, 700));
  const st = F.nnTextState();
  const sess = st.rects.filter(r => r.kind === "sess" && r.node && r.node.roles);
  const legendTxt = (document.getElementById("nnLegend") || {}).textContent || "";
  const lv = document.getElementById("nnLevels");
  const ex = document.getElementById("nnExport");
  const before = F.nnDrawLayers();
  F.setNnLevel("flat");
  const flat = F.nnDrawLayers();
  F.setNnLevel("noProj");
  const noProj = F.nnDrawLayers();
  F.setNnLevel("all");
  const back = F.nnDrawLayers();
  return {
    sessWithRoles: sess.length,
    roles: sess.map(r => r.node.roles),
    legendTxt: legendTxt,
    lvOpts: lv ? lv.options.length : 0,
    hasExport: !!ex,
    before, flat, noProj, back,
  };
});
ok(nnNew.lvOpts === 3, "神经网络新增「显示层级」下拉，3 个档位");
ok(nnNew.before.length === 3 && nnNew.flat.length === 1 && nnNew.noProj.length === 2 && nnNew.back.length === 3,
  "层级显隐真实生效（全部 " + nnNew.before.length + " → 只留会话 " + nnNew.flat.length + " → 隐藏项目框 " + nnNew.noProj.length + "）");
ok(nnNew.sessWithRoles >= 2, "会话矩形挂载了行角色分布（" + nnNew.sessWithRoles + " 个会话）");
ok(nnNew.roles.every(r => (r.ask || 0) > 0 && (r.ans || 0) > 0), "角色分布同时统计到「问」与「答」：" + JSON.stringify(nnNew.roles[0]));
ok(/📊/.test(nnNew.legendTxt) && /问/.test(nnNew.legendTxt), "图例区显示「问 / 答 / 子智能体」统计行：" + nnNew.legendTxt.replace(/\s+/g, " ").slice(0, 60));
ok(nnNew.hasExport, "神经网络新增「⬇ 导出 PNG」按钮");

// 点击导出不能抛页面错误（headless 下下载被忽略，但逻辑必须走通）
await page.evaluate(() => { const b = document.getElementById("nnExport"); if (b) b.click(); });
await page.waitForTimeout(300);
ok(errs.length === 0, "点击导出 PNG 未产生页面错误");

// ---------- 收尾 ----------
if (errs.length) console.log("\n页面错误：\n  " + errs.slice(0, 8).join("\n  "));
console.log("\n" + pass + " passed, " + fail + " failed" + (errs.length ? " , " + errs.length + " page errors" : ""));
await page.close();
await browser.close();
process.exit(fail > 0 ? 1 : 0);
