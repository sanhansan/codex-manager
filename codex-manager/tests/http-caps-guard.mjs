// HTTP 能力探测守卫：断言 initHttpWatch 里的「能力探测 + 数据载入」不依赖 PAYLOAD.watch。
// 背景（v0.24.2 修复的回归）：旧写法 `const w = PAYLOAD && PAYLOAD.watch; if (!w || ...) return;`
// 把守卫放在能力探测之前——直接打开编辑器（无注入工作副本）时 httpCaps 永远为 null，
// 🪙 Token / 📦 使用量 / ⚙ 设置 / 💬 问答自动同步 / 🧩 技能工坊提示全部不载入，
// 明明在 flow_serve.py 托管下却提示「用 flow_serve.py 托管才能自动读取」。
// 运行：node tests/http-caps-guard.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "assets", "flow-editor.html"), "utf8");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log("ok  -", name); pass++; }
  catch (e) { console.error("FAIL-", name, "::", e.message); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks[blocks.length - 1];

// 提取 initHttpWatch 函数源码（从声明起到下一个顶层 function/赋值行之前的平衡花括号）
function extractFn(src, name) {
  const i = src.indexOf("async function " + name + "()");
  ok(i >= 0, "找不到 " + name);
  let depth = 0, started = false, end = i;
  for (let j = i; j < src.length; j++){
    const ch = src[j];
    if (ch === "{"){ depth++; started = true; }
    else if (ch === "}"){ depth--; if (started && depth === 0){ end = j + 1; break; } }
  }
  return src.slice(i, end);
}

t("initHttpWatch 存在且可编译", () => {
  new vm.Script(extractFn(main, "initHttpWatch"), { filename: "initHttpWatch.js" });
});

t("能力探测不得被 PAYLOAD.watch 守卫拦截（回归：Token 区块空白根因）", () => {
  const fn = extractFn(main, "initHttpWatch");
  const probeAt = fn.indexOf("httpCaps = info");
  const loadAt = fn.indexOf("loadHttpClientUsage()");
  ok(probeAt > 0, "找不到能力探测（httpCaps = info）");
  ok(loadAt > probeAt, "数据载入（loadHttpClientUsage）应出现在能力探测之后");
  // 守卫若仍存在，必须只拦「双向同步」而不拦探测/载入：即 loadHttpClientUsage 之前
  // 不允许出现把 !w 与 return 放在同一守卫里的写法
  const head = fn.slice(0, probeAt);
  ok(!/if\s*\(\s*!w\s*\|\|/.test(head), "能力探测之前不得有 `if (!w || ...) return` 守卫（会把无工作副本的会话拦在探测之外）");
});

t("数据载入在无 watch 分支之前执行（无工作副本也载入 Token/用量/设置/问答）", () => {
  const fn = extractFn(main, "initHttpWatch");
  const loadAt = fn.indexOf("loadHttpClientUsage()");
  const noWatchAt = fn.indexOf("if (!w){");
  ok(noWatchAt > loadAt, "`if (!w){` 分支应位于数据载入之后（只跳过双向同步）");
  ok(fn.indexOf("startQaSync()") > 0 && fn.indexOf("startQaSync()") < noWatchAt,
     "startQaSync 应在无 watch 分支之前调用（问答自动同步不依赖工作副本）");
});

t("占位符必须用 tx() 而不是 T()（已连接智能体卡片「主会话 {0} · 子智能体 {1}」）", () => {
  ok(!/T\('主会话 \{0\} · 子智能体 \{1\}'/.test(main),
     "检测到 T('主会话 {0} · 子智能体 {1}')——T() 不做占位符替换，会显示字面 {0}/{1}，应为 tx()");
  ok(/tx\('主会话 \{0\} · 子智能体 \{1\}'/.test(main), "未找到 tx('主会话 {0} · 子智能体 {1}') 调用");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
