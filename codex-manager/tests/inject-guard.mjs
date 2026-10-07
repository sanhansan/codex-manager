// 注入完整性守卫：模拟 /codex-flow-edit 的「模板 + mermaid → 工作副本」注入，
// 断言注入后的 HTML 里 `const PAYLOAD = ...` 仍是**单行**，且 <script> 能被解析。
// 背景：若注入时把 JSON 里的 \n 还原成真换行，<script> 会整体解析失败，
// 表现为「页面能打开，但**任何选项点击都没有反应**」（所有事件监听器都没绑上）。
// 运行：node tests/inject-guard.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

// 与 codex-flow-edit.md 里的注入逻辑保持一致：
// Python 侧 json.dumps(...).replace("</", "<\\/") —— 即把 `</` 转成 `<\/`
// （JS 字符串里没有这种“转义斜杠”的写法，所以这里用显式字符替换模拟）
function inject(tpl, mermaid, source, session) {
  const rev = createHash("sha1").update(mermaid, "utf8").digest("hex").slice(0, 10);
  const payload = JSON.stringify({ mermaid, source, session: session || "", exportName: "flow-export.mmd", watch: "flow-source.mmd", rev })
    .split("</").join("<" + "\\" + "/");
  ok(tpl.includes("/*__FLOW_DATA__*/null"), "模板缺少注入标记");
  return tpl.replace("/*__FLOW_DATA__*/null", payload);
}

// 一个「狠」样例：多行 mermaid + 撇号 + 反引号 + </script> + 换行 + 制表符 + emoji
const MERMAID = [
  "flowchart TD",
  '  A["用户发起：验证注入"]',
  "  B{条件判断}",
  '  C["含 \\"双引号\\" 与 \'单引号\'"]',
  "  D[\"含反引号 `code` 与 </script> 结束标签\"]",
  "  E[\"多行\t制表符与 emoji 🧠🤖\"]",
  "  A --> B",
  "  B --> C",
  "  B --> D",
  "  C --> E",
].join("\n");

t("注入后 PAYLOAD 不跨行（否则 <script> 解析失败 → 点击无反应）", () => {
  const out = inject(html, MERMAID, "单测 · 注入守卫", "sess_test");
  const lines = out.split("\n").filter(l => l.startsWith("const PAYLOAD ="));
  ok(lines.length === 1, "PAYLOAD 跨了 " + lines.length + " 行（JSON 未正确转义）");
  ok(!/^const PAYLOAD = .*\n/.test(lines[0]), "PAYLOAD 行内含裸换行");
});

t("注入后整段主 <script> 可被解析（vm 编译通过）", () => {
  const out = inject(html, MERMAID, "单测 · 注入守卫");
  const blocks = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  ok(blocks.length >= 1, "找不到 <script> 块");
  const main = blocks[blocks.length - 1];
  // 只编译不运行：语法错误会在此抛出，正是导出/实机「点击无反应」的根因
  new vm.Script(main, { filename: "flow-editor.injected.js" });
});

t("注入后 PAYLOAD 能 JSON.parse 回原始 mermaid（内容无损坏）", () => {
  const out = inject(html, MERMAID, "单测 · 注入守卫");
  const line = out.split("\n").find(l => l.startsWith("const PAYLOAD ="));
  // 模板原句是 `const PAYLOAD = /*__FLOW_DATA__*/null;`，注入后行尾带一个 `;`，需剥掉
  let json = line.slice("const PAYLOAD = ".length);
  json = json.replace(/;\s*$/, "");
  const obj = JSON.parse(json);
  ok(obj.mermaid === MERMAID, "mermaid 往返内容不一致");
  ok(obj.rev && obj.rev.length === 10, "rev 指纹缺失或长度不对");
});

t("含 </script> 的 mermaid 不会提前闭合脚本标签", () => {
  const evil = 'flowchart TD\n  A["带有 </script> 的家：危险"]';
  const out = inject(html, evil, "单测 · 转义");
  const blocks = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  // 仍是「1 个」主脚本块（没有被 </script> 提前切开导致多出碎块）
  const opens = (out.match(/<script>/g) || []).length;
  const closes = (out.match(/<\/script>/g) || []).length;
  ok(opens === closes, "<script>/</script> 数量不匹配：" + opens + " vs " + closes);
  const main = blocks[blocks.length - 1][1];
  new vm.Script(main, { filename: "escaped.js" });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
