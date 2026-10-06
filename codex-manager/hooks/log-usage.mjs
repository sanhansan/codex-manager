// codex-manager 用量记录钩子：从 stdin 读取 hook JSON，追加一行到用量日志。
// 日志位置：%USERPROFILE%\.zcode\codex-manager\usage.jsonl（每行一个 JSON 对象）。
// 任何错误都静默退出 0 且不产生输出，绝不干扰正常会话。
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_STDIN_CHARS = 1_000_000;
const STDIN_TIMEOUT_MS = 3000;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve(data);
      }
    };
    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        if (data.length < MAX_STDIN_CHARS) data += chunk;
      });
      process.stdin.on("end", finish);
      process.stdin.on("error", finish);
      setTimeout(finish, STDIN_TIMEOUT_MS);
    } catch {
      finish();
    }
  });
}

function asText(value, max = 160) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

// kind: "skill" | "mcp" | "session"；返回要写入的记录，无法识别时返回 null（不写入）。
function buildRecord(kind, p) {
  const rec = {
    ts: new Date().toISOString(),
    kind,
    plugin: "",
    name: "",
    session: asText(p.session_id ?? p.sessionId, 64),
    cwd: asText(p.cwd, 200),
  };

  if (kind === "session") {
    rec.plugin = "codex";
    rec.name = asText(p.source ?? p.match_key ?? "start", 32) || "start";
    return rec;
  }

  const tool = typeof p.tool_name === "string" ? p.tool_name : "";
  if (tool === "Skill") {
    const input = p.tool_input ?? p.toolInput ?? {};
    const raw = asText(input.skill ?? input.name ?? input.command);
    if (!raw) return null;
    const i = raw.indexOf(":");
    rec.plugin = i > 0 ? raw.slice(0, i) : "(direct)";
    rec.name = i > 0 ? raw.slice(i + 1) : raw;
    rec.name = asText(rec.name, 120);
    return rec;
  }

  if (tool.startsWith("mcp__")) {
    const parts = tool.split("__");
    rec.plugin = asText(parts[1], 80) || "(unknown)";
    rec.name = asText(parts.slice(2).join("__"), 120) || tool;
    return rec;
  }

  return null;
}

function dataDir() {
  return (
    process.env.ZCODE_PLUGIN_DATA_DIR ||
    process.env.CLAUDE_PLUGIN_DATA_DIR ||
    join(homedir(), ".zcode", "codex-manager")
  );
}

const kind = process.argv[2] || "skill";
const raw = await readStdin();
let payload = {};
try {
  payload = JSON.parse(raw);
} catch {
  payload = {};
}
try {
  const rec = buildRecord(kind, payload);
  if (rec) {
    const dir = dataDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "usage.jsonl"), JSON.stringify(rec) + "\n", "utf8");
  }
} catch {
  // 记录失败也不影响会话
}
process.exit(0);
