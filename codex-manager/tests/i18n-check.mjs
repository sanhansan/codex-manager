// i18n 覆盖率检查：找出 T()/tx()/data-i18n 用到但 I18N 字典里缺少英文条目的键
// 运行：node tests/i18n-check.mjs（在插件目录下执行）
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "assets", "flow-editor.html"), "utf8");

const used = new Set();
for (const m of html.matchAll(/(?:^|[^A-Za-z_$])T\('((?:[^'\\]|\\.)*)'\)/g)) used.add(m[1].replace(/\\'/g, "'"));
for (const m of html.matchAll(/(?:^|[^A-Za-z_$])tx\('((?:[^'\\]|\\.)*)'/g)) used.add(m[1].replace(/\\'/g, "'"));
for (const m of html.matchAll(/data-i18n(?:-title|-ph|-html)?="([^"]*)"/g)) used.add(m[1]);

const dictStart = html.indexOf("const I18N = {");
const dictEnd = html.indexOf("};", dictStart);
const dict = html.slice(dictStart, dictEnd);
const have = new Set();
for (const m of dict.matchAll(/'((?:[^'\\]|\\.)*)':/g)) have.add(m[1].replace(/\\'/g, "'"));

const missing = [...used].filter(k => !have.has(k) && !k.startsWith("help-") && k);
missing.sort();
console.log("used:", used.size, "dict:", have.size, "missing:", missing.length);
missing.forEach(k => console.log(JSON.stringify(k)));
process.exit(missing.length ? 1 : 0);
