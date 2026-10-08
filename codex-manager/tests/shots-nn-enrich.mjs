// v0.27.3 神经网络信息增强 —— 视觉验收截图
// 隔离做法：读 assets/flow-editor.html → 注入 PAYLOAD（/*__FLOW_DATA__*/null）→ 写临时文件 → file:// 打开。
// **不连本地服务**，因此不会污染 ~/.zcode/codex-manager/wf-backup.json（v0.27.3 踩过的坑）。
// 输出目录：环境变量 NN_SHOTS_OUT，默认 <插件>/tests/_shots。
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "..", "assets", "flow-editor.html");
const require = createRequire(import.meta.url);
const OUT = process.env.NN_SHOTS_OUT || join(here, "_shots");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// 1) 解析 Chromium
function resolveChromium(){
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null,
  ].filter(Boolean);
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
// 2) 解析 playwright-core
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
const pwPath = resolvePlaywright();
const chrome = resolveChromium();
if (!pwPath || !chrome){
  console.log("SKIP - 需要 playwright-core 与 Chromium：", pwPath || "无 playwright-core", "/", chrome || "无 chromium");
  process.exit(0);
}
const { chromium } = require(pwPath);

// 3) 注入 PAYLOAD（与 /codex-flow-edit 的注入位一致）
const MERMAID = ["flowchart LR", '  n1["自动评测"]', '  n2["统计图表"]', "  n1 -->|是| n2"].join("\n");
const payload = { workflow: "自动评测引擎", rev: "shots-nn-enrich-v273", mermaid: MERMAID,
  source: "shots-nn-enrich", session: "sess_shots", exportName: "自动评测.mmd" };
const html = readFileSync(htmlPath, "utf8");
const marker = "/*__FLOW_DATA__*/null";
if (html.indexOf(marker) < 0) { console.error("找不到注入标记 " + marker); process.exit(1); }
const tmp = join(here, "_tmp-shots-nn-enrich.html");
writeFileSync(tmp, html.replace(marker, JSON.stringify(payload)), "utf8");

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", e => errs.push(String((e && e.message) || e)));
await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
await page.waitForFunction(() => window.__flow && window.__flow.g(), null, { timeout: 20000 });

// 4) 造多项目 / 多智能体 / 含子智能体的样例（页面内，不落盘）
await page.evaluate(() => {
  const F = window.__flow, WF = F.wf();
  const NOW = Date.now(), H = 3600000;
  const mk = (name, client, cwd, ts, turns) => ({
    name,
    data: { name, dir: "LR", nodes: [
      { id: "n1", x: 0, y: 0, w: 236, h: 96, label: name, kind: "agent",
        doc: "const rules = loadRules();\nexport default rules;", file: "rules.js" },
      { id: "n2", x: 320, y: 120, w: 236, h: 96, label: name + "·校验", kind: "cond",
        doc: "if (!ready) return { ok: false };", file: "guard.js" },
    ], edges: [{ from: "n1", to: "n2", label: "是" }], subs: [] },
    src: { parent: WF.active, client, session: "sess_" + name, task: name, ts, cwd,
      project: cwd.replace(/^.*[\\/]/, ""), turns },
  });
  WF.list.push(
    mk("自动评测引擎", "qoder", "C:/work/体测成绩系统", NOW - 9 * H, [
      { node: "n1", q: "按国家学生体质健康标准实现自动评测规则库", ts: NOW - 9 * H, subs: ["sub1"],
        a: "已按《国家学生体质健康标准(2014年修订)》落地规则库：RULES 表按项目 code 索引，piecewise 按性别/年级取分段阈值，返回 (score, level)。" },
      { node: "n2", q: "校验评分阈值与等级边界", ts: NOW - 8 * H, subs: [],
        a: "边界用例通过：59.9 不及格、60 及格、79.9 及格、80 良好、89.9 良好、90 优秀。" },
    ]),
    mk("成绩导入", "zcode", "C:/work/体测成绩系统", NOW - 6 * H, [
      { node: "n1", q: "实现成绩批量导入与 EasyExcel 解析", ts: NOW - 6 * H, subs: [],
        a: "EasyExcel 读表头映射 DTO，边读边校验，空值跳过并计入失败行。" },
      { node: "n2", q: "优化批量入库性能与事务边界", ts: NOW - 5 * H, subs: [],
        a: "每批 1000 条 + 单事务，失败整批回滚；实测 5 万行 3.2 秒。" },
    ]),
    mk("选题调研", "codex", "C:/work/毕业论文", NOW - 7.5 * H, [
      { node: "n1", q: "梳理近四年题目去重后的空白方向", ts: NOW - 7.5 * H, subs: [],
        a: "三年 930 条题目去重后，空白集中在 LLM 应用、知识图谱、OCR 与自动化测试四块。" },
    ]),
    mk("图表联调", "gemini", "C:/work/体测成绩系统", NOW - 1.2 * H, [
      { node: "n1", q: "ECharts 统计图表与雷达图对接", ts: NOW - 1.2 * H, subs: [],
        a: "ECharts 5 的 radar 系列对接：indicator 取五项素质，data 按班级聚合，chart.setOption 一次绘入。" },
    ]),
  );
  F.fillWfSel();
  F.showView("nn");
  F.renderNn();
});
await page.waitForTimeout(1200);

async function shot(name, prep, settle = 1000){
  await page.evaluate(prep);
  await page.waitForTimeout(settle);
  const fp = join(OUT, name + ".png");
  await page.screenshot({ path: fp });
  console.log("shot:", fp);
}

// A) 总览：统计 HUD + 智能体图例 + 小地图 + 标题统计徽章
await shot("enrich-1-overview", () => { window.__flow.showView("nn"); window.__flow.ntFitView(true); }, 1300);
// B) 条带档：角色色条（问 / 答 / 子智能体）
await shot("enrich-2-strips-role", () => {
  const F = window.__flow, st = F.nnTextState(), v = F.nnTextView();
  const t = st.rects.filter(r => r.kind === "turn" && r.h > 2)[0];
  if (!t) return;
  const z = 1.6;
  v.tz = z; v.z = z; v.tx = st.bw / 2 - (t.x + t.w / 2) * z; v.ty = st.bh / 2 - (t.y + t.h / 2) * z;
  v.x = v.tx; v.y = v.ty; v.flying = false; F.ntUpdateLod();
}, 1100);
// C) 文字档：可读代码 + 行号按角色着色
await shot("enrich-3-text-role", () => {
  const F = window.__flow, st = F.nnTextState(), v = F.nnTextView();
  const t = st.rects.filter(r => r.kind === "turn" && (r.lines || []).length >= 3)[0]
    || st.rects.filter(r => r.kind === "turn")[0];
  if (!t) return;
  const rowH = t.h / Math.max(1, (t.lines || []).length);
  const z = Math.max(1, Math.min(200, 12 / Math.max(0.05, rowH)));
  v.tz = z; v.z = z; v.tx = st.bw / 2 - (t.x + t.w / 2) * z; v.ty = st.bh / 2 - (t.y + t.h / 2) * z;
  v.x = v.tx; v.y = v.ty; v.flying = false; F.ntUpdateLod();
}, 1100);
// D) 着色：按时间（冷=早 → 暖=近）
await shot("enrich-4-color-time", () => {
  const sel = document.getElementById("nnColor");
  sel.value = "time"; sel.dispatchEvent(new Event("change"));
  window.__flow.ntFitView(true);
}, 1100);
// E) 着色：按活跃度
await shot("enrich-5-color-load", () => {
  const sel = document.getElementById("nnColor");
  sel.value = "load"; sel.dispatchEvent(new Event("change"));
  window.__flow.ntFitView(true);
}, 1100);
// F) 图例过滤：只看一个智能体（HUD 出现过滤芯片 + 「显示全部」复位）
await shot("enrich-6-filter", () => {
  const sel = document.getElementById("nnColor");
  sel.value = "client"; sel.dispatchEvent(new Event("change"));
  const chip = [...document.querySelectorAll("#nnLegend .lg[data-cl]")].find(e => e.dataset.cl === "qoder")
    || document.querySelector("#nnLegend .lg[data-cl]");
  if (chip) chip.click();
  setTimeout(() => window.__flow.ntFitView(true), 120);
}, 1300);

console.log("\n页面错误:", errs.length ? errs.slice(0, 5).join(" | ") : "none", "(共 " + errs.length + ")");
await page.close();
await browser.close();
