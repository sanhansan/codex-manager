# Codex Manager

Plugin usage tracking & session flowcharts for Codex workbenches.

English | [简体中文](README.zh-CN.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-ZCode%20Plugin-green.svg)
![Runtime](https://img.shields.io/badge/runtime-Node.js%20%7C%20Python%203.x-yellow.svg)

This plugin targets Codex-style AI coding agent workbenches (built on the ZCode plugin ecosystem) and answers two questions that come up all the time: "Of all the plugins I've installed, which ones do I actually use?" and "How exactly did the AI get this task done, step by step?" With silent background hooks and one-command results, it keeps plugin usage and your working process fully visible — no extra effort required.

**Why it matters: a flowchart is not a picture, it is a review instrument.** When every session becomes a diagram, detours, repeated steps and wasted effort become visible at a glance — so you can audit the process, revise it, and make the next run faster. Codex Manager turns "see the flow → review it → improve it" into a habit, and the usage stats tell you whether each change actually helped.

> **Maintenance** — Actively maintained by [@sanhansan](https://github.com/sanhansan), last updated 2026-10-07. For bug reports or adaptation requests, please open an [Issue](https://github.com/sanhansan/codex-manager/issues).

## Download & Use the Release Packages

Release packages are published on the [Releases](https://github.com/sanhansan/codex-manager/releases) page; v0.20.0 is the latest complete package (the v0.12.0–v0.19.0 continuous iterations are consolidated into it — per-version details are in the table below and the CHANGELOG):

| Version | Date | Contents | For whom |
| --- | --- | --- | --- |
| **v0.20.0 (latest, recommended)** | 2026-10-07 | Editor v11: __"tech-plain" visual rewrite__ (neutral grays, unified 2px radii, all shadows & hover-lift removed, 24px fine-line engineering grid on the canvas, tabular numerals + monospace KPIs/timestamps/paths, dark terminal-style toasts, rewritten light AND dark themes) · __restrained engineering micro-animations__ (button press, view / card / dialog fade-ins, accent flash on newly created nodes & edges, KPI count-up, usage bars growing in, token chart drawing itself in, flowing dashed lines on the control map, full `prefers-reduced-motion` fallback) | Everything in one package |
| v0.19.0 | 2026-10-07 | Editor v10: whole-tree "⊞ export / ⊟ import" (merge semantics, single-canvas JSON accepted) · automatic server-side backup (`/__flow_wf_state` — every edit snapshotted, restored after a lost browser store) · 🤖 sub-agent node "📄 view output" dialog (Qoder full-output loading included) · duration annotations on tree chats and canvas nodes (⏱ time to next question) · token cost estimation (set model prices in ⚙ settings; shown on the KPI / model table / period details / hover tooltip) | Everything in one package |
| v0.18.0 | 2026-10-07 | Editor v9: "⤵ import to canvas" now creates a __standalone conversation canvas__ (current canvas untouched; re-import merges) · three-level workflow tree (root canvas → conversation canvases with client dot / task name / time → expandable small conversations with 💬 question digest & 🤖 sub-agent badges, click to jump-and-flash the nodes) · task names instead of code IDs (continuation-injection turns filtered) · file sync pinned to the main flow — conversation-canvas edits stay local, deferred file updates apply on return | Everything in one package |
| v0.17.0 | 2026-10-07 | Editor v8: one-click "⤵ import to canvas" from the Control-Flow session tables (append semantics, whole import undoable with Ctrl+Z) · ⚙ Settings dialog — edit the 5 data-source directories (usage.jsonl / rollout / agents / Codex / Qoder) with instant effect (`/__flow_settings` endpoint; startup CLI flags still win) | Everything in one package |
| v0.16.0 | 2026-10-07 | Editor v7: multi-client (ZCode / Codex CLI / Qoder CLI) Q&A & token dashboard — auto-sync of latest sessions + all sub-agents with client color badges · one-click highlights & reusable prompts · one-click work canvas (🧠 chain + 🤖 dashed attachments) · token line chart with day/month toggle, per-client hover breakdown, click a point for period details & jump-to-Q&A · per-client model usage · canvas sync self-healing (⚠ notice + 4s auto-reconnect) | Everything in one package |
| v0.15.0 | 2026-10-07 | Editor v6: Q&A auto-sync of the latest session + all sub-agents (6s polling) · keyword digest bar with click-to-filter · bilingual prompt summary with copy/export · 🧩 Agent Skills (drafts from prompts or habits, export / one-click install) · canvas "＋skeleton" · token daily line chart with hover detail | Everything in one package |
| v0.14.0 | 2026-10-07 | Editor v5: bilingual UI (🌐 one-click zh/en toggle) · 🛠 Skill workshop (auto-draft a SKILL.md from habit candidates, edit it, save to drafts or install into the plugin) · in-place node editing (double-click a node to rename) · UI polish | Everything in one package |
| v0.13.0 | 2026-10-07 | Editor v4: zero-click HTTP auto-connect (flow_serve.py — AI edits redraw the canvas, canvas edits write back atomically) · master-control "📦 usage" and "🪙 token usage" blocks (auto-loaded on startup) | Everything in one package |
| v0.12.0 | 2026-10-07 | Codex CLI adapter: per-plugin usage (config.toml manifest + plugin-cache MCP mapping) · per-task consumption (task_started→task_complete diffing; Top 10 table + Excel "Task details" sheet) · token accounting fix (thread_token_usage — fixes a ~77× undercount) | Headless / no editor needed |
| v0.10.0 | 2026-10-06 | Full: visual flowchart editor v3 (node kinds input/agent/map/cond/merge/output · feedback edges · drag-reconnect · trace query · standalone skill summary · AI edge optimization · resumable file sync) + all history | Everything in one package |
| v0.9.0 | 2026-10-06 | Full: visual flowchart editor v2 (left taskbar · 3 views · multi-workflow · logic gates · file two-way sync · habits & skill summary dashboard) + review loop + Codex CLI adapter | Everything in one package |
| v0.5.0 | 2026-10-06 | First visual flowchart editor + review loop + Codex CLI adapter | Try the canvas editor |
| v0.4.0 | 2026-10-06 | Full: process review & improvement loop + ZCode plugin + OpenAI Codex CLI adapter | Headless / no editor needed |
| v0.2.0 | 2026-10-06 | ZCode plugin + structured bilingual docs | ZCode only |
| v0.1.0 | 2026-10-06 | Initial ZCode plugin | Basic usage tracking only |

**How to use a downloaded zip**:

1. **ZCode plugin** (included in every version): unzip → ZCode → Plugin Marketplace → Add → Add Plugin Marketplace → select the extracted `codex-manager` folder (the one containing `marketplace.json`) → install Codex Manager under "Personal".
2. **OpenAI Codex CLI adapter** (since v0.3.0): enter the extracted `codex-cli-adapter/`, run `powershell -ExecutionPolicy Bypass -File install.ps1` on Windows or `./install.sh` on macOS/Linux, then **restart Codex** and use `/codex-usage` or `/codex-flow` in a session.
3. **Standalone CLI** (since v0.3.0, no host required): `python codex-cli-adapter/codex_manager.py usage --days 30 --xlsx report.xlsx` to analyze local Codex usage directly.

See [CHANGELOG.md](./CHANGELOG.md) for the changes in each version.

## Core Architecture & Features

The plugin is organized into four logical modules: automatic usage collection, one-command reports, session flowchart retrospectives, and a standalone OpenAI Codex CLI adapter.

### 1. Automatic Usage Collection (Zero Effort)

Aimed at the pain of installing plenty of plugins without knowing how much they are actually used, this module provides fully automatic background logging.

- __Skill invocation tracking__ — A `PostToolUse` hook captures every plugin skill invocation and archives it by "plugin + skill" pair.
- __MCP tool tracking__ — Every `mcp__`-prefixed MCP tool call is captured, grouped by MCP server, and presented together with plugin usage.
- __Session counting__ — A `SessionStart` hook records every session start, quantifying your day-to-day workload.
- __Silent & reliable__ — Hook scripts always exit silently on any error and never block or interrupt your sessions.

### 2. One-Command Reports (`/codex-usage`)

Aggregates, presents and exports the collected usage data on demand.

- __In-chat breakdown__ — Prints a Markdown table sorted by call count, covering plugin/source, skill/tool, type, call count, session count and last-used time.
- __Excel export__ — Generates a styled two-sheet workbook (Details + Overview) with a frozen header row and auto-filter, named `codex-usage-<timestamp>.xlsx`.
- __Time window__ — Pass a parameter to limit the report to the last N days; defaults to all records.
- __Graceful fallback__ — Falls back to CSV (UTF-8 with BOM, opens directly in Excel) when openpyxl is unavailable; nothing is ever installed.

### 3. Session Flowchart Retrospectives (`/codex-flow`)

Turns a work session into a shareable Mermaid flowchart.

- __Current session__ — Outlines the ongoing conversation — user request → work phases → key branches → final deliverables — as a `flowchart TD` diagram saved to a `.md` file.
- __Past sessions__ — Parses the workbench session logs (`model-io-sess_*.jsonl`), extracting user prompts and tool calls in order; locate a session with `recent` or a session-ID fragment.
- __Smart splicing__ — Long sessions are reconstructed by joining the "earliest full snapshot + recent window" for the most complete picture.
- __Honest annotations__ — When a middle chunk of the log is missing, a gap marker honestly notes "middle omitted"; flow nodes are never fabricated.

### 4. OpenAI Codex CLI Adapter (`codex-cli-adapter/`)

A second adaptation target for the OpenAI Codex CLI (verified against codex-cli 0.157.1). Since Codex CLI has no hook system, the adapter achieves the same capabilities through three channels: scanning `~/.codex/sessions` rollout logs offline for usage stats; registering a standard-library-only MCP server exposing `codex_usage` / `codex_flow` / `codex_sessions` tools; and installing `/codex-usage` and `/codex-flow` custom commands. Metrics cover MCP server calls, native tools such as `exec`, built-in namespaces like `collaboration`, plus **per-plugin usage** (installed plugins from config.toml, with MCP calls attributed to plugins via the plugin cache manifests) and **per-task consumption** (task-level token breakdowns and top ranking, with honest annotation for compacted sessions).

```bash
powershell -ExecutionPolicy Bypass -File codex-cli-adapter/install.ps1   # Windows
./codex-cli-adapter/install.sh                                           # macOS / Linux
```

See [codex-cli-adapter/README.md](./codex-cli-adapter/README.md) for details.

### 5. Process Review & Improvement Loop (v0.4.0)

Turns "seeing the process" into "improving the process":

- __Self-questioning process review__ (`/codex-review`): 7 classes of review questions answered one by one, producing typed recommendations (omit / optimize / keep / habit), each backed by event evidence and quantified benefit;
- __End-of-project retrospective__ (`/codex-optimize`): a retrospective report plus optimized prompt recommendations — ready-to-paste prompt templates that absorb the pitfalls of the project;
- __Habits into skills__ (`/codex-habit`): distills personal habits from usage logs and review records, autonomously writes SKILL.md drafts, and installs them on confirmation;
- __Continuous flow framework__ (`/codex-flow-save`): merges each session into a project-level framework `flow.json` (human-editable, endlessly modifiable and extensible), with flowchart image rendering (kroki.io / mermaid-cli / AI image generation, in fallback order);
- __Multi-agent review__ (`/codex-agents-review`): efficiency / quality / prompt sub-agents review in parallel; the master agent deduplicates, arbitrates and aggregates; findings accumulate across sessions and agents (`agent_summaries`);
- __Final aggregation__ (`/codex-summary`): rolls the continuously built framework into a master flowchart and a closed-loop review report.

### 6. Visual Flowchart Editor (v0.5.0–v0.20.0)

`/codex-flow-edit` opens `assets/flow-editor.html` — a dependency-free, single-file canvas editor (works offline):

- __Node kind system__ (v0.10.0, inspired by DeepSeek Flow): six node kinds — input / agent / map / cond / merge / output — one click from the toolbar with colored badges; kinds ride along as `◈agent`-style label suffixes across all three formats; "＋new flow framework" creates a workflow around an input → agent → cond (yes/no) → merge → output skeleton, and since v0.15.0 a "＋skeleton" toolbar button inserts that skeleton (with the dashed feedback loop) directly into the __current__ canvas — IDs auto-remapped, auto-laid-out to the right of existing content, undoable;
- __Edge editing__ (v0.10.0): drag an edge endpoint onto another node to reconnect; parallel edges auto-lane; feedback cycles (DFS back edges) routed in red; "✨ tidy" dedupes edges and re-layouts (wider gaps, centered rows);
- __Bilingual UI + in-place node editing__ (v0.14.0): a __🌐 EN / 中文__ toggle in the top bar switches the whole UI language in one click (preference persisted; node kinds, gates, dynamic hints and auto-generated skill descriptions follow suit); __double-click a node (or press F2)__ to rename it right on the canvas via a floating input (Enter commits / Esc cancels — undoable and written back to the file);
- __Left taskbar, six views__: 🖼 canvas / 🛰 distributed workspaces / 🧭 master-control map & table / 🧩 __Agent Skills__ (standalone module since v0.10.0; renamed from "skill summary" in v0.15.0) with the __🛠 skill workshop__ — "✨ draft from habit candidates" or "✨ draft from Q&A / prompts" (v0.15.0: distills the loaded Q&A into a SKILL.md — theme from top keywords, When-to-use / Steps / evidence / stats) auto-write a SKILL.md you can edit, then "⬇ export SKILL.md", "💾 save to drafts" or "📦 save & install into the plugin" (installed rows are flagged "✅ callable by agents via the Skill tool"; save/install run through the `flow_serve.py` HTTP host) / 📜 trace query (replay every call filtered by keyword / kind / session) / 💬 Q&A (new in 0.11.0: expand each item for the full question, answer and keywords; badges distinguish the master agent from sub-agent chats, canvas-source sessions are marked, one click to add as a canvas node; __v0.15.0__: when served by `flow_serve.py` the latest session __and all of its sub-agents__ auto-load and re-sync every 6s — answers still being written keep growing in without duplicates — plus a keyword digest bar (🧠 task keywords / 🤖 sub-agent keywords, count per chip, click to filter) and a "📝 generate prompt summary" panel with copy / export .md);
- __Usage & token usage inside master control__ (v0.13.0): the 🧭 master-control view gains a "📦 usage" block next to the reference map and table — KPIs (records / sessions / skill calls / MCP calls / plugins), a per-plugin usage bar chart and a detail table (calls · skill/MCP split · share · last use · top skills/tools), sharing the same usage.jsonl data with the 🧩 Agent Skills and 📜 trace query views; plus a "🪙 token usage" block — total tokens (= input + output + cache read) / input / cache read / output / model-call KPIs, since v0.15.0 a __daily SVG line chart with a hover tooltip__ (that day's total / input / cache read / output / model calls, with a highlight marker), a per-model table, a __per-plugin token attribution table__ (model calls that trigger or consume a plugin's tools — `mcp__server__tool` / `Skill` — are credited to that plugin, multi-plugin calls split evenly, everything else counts as "unattributed", and the rows reconcile exactly with the total) and a __full per-session table__ (click a row to expand its per-day breakdown and per-plugin split); all aggregated server-side from the ZCode rollout logs (`%USERPROFILE%\.zcode\cli\rollout\`); both datasets __auto-load on startup with zero clicks__ when served by `flow_serve.py` (manual pick/paste channels remain available over file://);
- __Multi-client Q&A & token dashboard__ (v0.16.0): `flow_serve.py` now scans three clients at once — ZCode rollout, Codex CLI `~/.codex/sessions` and Qoder CLI sessions + subagents — via `GET /__flow_clients`, `GET /__flow_client_file?client=&id=&tail=` and `GET /__flow_client_usage` (one unified metric: input = net input, cache read listed separately, so input + cache read + output = total; Qoder, whose local logs carry no token counts, is honestly annotated and sorts its per-model table by calls); the 🪙 token block becomes a multi-client board — merged KPIs, client filter chips, __day / month toggle__, hover tooltips with the per-client breakdown, __click a data point for a period detail card__ (per-client model tables and active sessions, each row with "→ view Q&A" jumping to the Q&A view positioned on that session), per-client model usage and a merged per-session table; the 💬 Q&A view auto-syncs all three clients (color badges ZCode / Codex CLI / Qoder per row) and rows carry "→ view X usage" to jump back to the token block filtered to that client; __"⚡ highlights & prompts"__ scores the loaded Q&A automatically (core themes, deep answers, multi-tool chains, heavy sub-agents — no manual labeling) and rolls the reusable prompts up, while __"🖼 build work canvas"__ turns it into a canvas (🧠 master task chain + 🤖 sub-agent dashed attachments, undoable with Ctrl+Z);
- __Sync self-healing__ (v0.16.0): canvas sync no longer goes silently stale — if the HTTP host goes down the editor shows "⚠ local service not connected…" and retries every 4 seconds (the file poll detects a disconnect after consecutive failures), so once `flow_serve.py` is back the two-way sync and Q&A sync resume automatically; the Q&A parser now merges __all__ message windows by `messageOffset` (previously only the last window + the full snapshot), so sessions logged purely as tail/delta fragments no longer parse to zero turns;
- __Import session to canvas + ⚙ settings__ (v0.17.0, import semantics revised in v0.18.0): the Control-Flow per-session tables (both the row and its expanded detail line) gain a "⤵ import to canvas" button — one click creates a __standalone conversation canvas__ holding that session's Q&A as a 🧠 master task chain with 🤖 sub-agent dashed attachments (the current canvas stays untouched; re-importing the same session merges/updates that canvas in place instead of duplicating it; if the session is not loaded yet the editor fetches it on demand via `/__flow_clients` + `/__flow_client_file`); the left taskbar gains an __⚙ Settings__ dialog for the __5 data-source directories__ (usage.jsonl / ZCode rollout / ZCode agents / Codex CLI sessions / Qoder CLI data) — each row shows the default, the effective path and a ✓/✗ existence check, saving takes effect immediately without a service restart (persisted to `~/.zcode/codex-manager/flow-settings.json`, overrides only, atomic write; clear a field to fall back to the default; directories pinned by startup CLI flags stay locked 🔒); the server adds `GET/POST /__flow_settings` (relative paths rejected with 400; validate → persist → apply, so a failure never leaves a half-applied state; `/__flow_ping` gains a `settings` capability flag);
- __Conversation canvases & three-level workflow tree__ (v0.18.0): the left taskbar's workflow list becomes a tree — root canvases (▾ expandable, showing "N conversations") → conversation canvas rows (client color dot · __task name__ instead of raw IDs · time) → expandable __small conversations__ (💬 question digest + 🤖N sub-agent badge) — one long task thread stays one conversation canvas no matter how many follow-up questions it has (each question is a small conversation under it), and __clicking a small conversation jumps-and-locates__: the editor switches to that canvas, centers the question's node together with its sub-agents and flashes them for 1.7s (missing nodes are reported honestly); titles come from the session's first task question with continuation-injection turns ("This session is being continued…") filtered out and shown as "(context continuation)"; the Control-Flow session table's first column becomes "Task / Session". __File sync is pinned to the main flow__: the sync channel (HTTP auto-connect or a manually connected file) always belongs to the root main-flow canvas — edits on a conversation canvas stay local and are never written back to `flow-source.mmd`, file updates arriving while you are on a conversation canvas are deferred until you return (status bar shows "⏸ file sync only applies to ‹main flow›…"); renaming/deleting a root canvas re-parents or detaches its conversation canvases automatically; conversation canvases are badged in the distributed-workspace cards and the Control-Flow table (🗂 task name · mounted under · N small conversations);
- __Whole-tree backup · output viewer · durations · cost estimation__ (v0.19.0): the 🛰 distributed-workspaces view gains __"⊞ export all workflows"__ (the whole tree — conversation canvases and their small conversations with session metadata — as one JSON) and __"⊟ import workflow tree"__ (__merge semantics__: canvases of the same session update in place, a same-name canvas from a different source is renamed "name · 2", the rest are appended; single-canvas JSON is accepted; the toast reports updated / added / renamed / skipped); `flow_serve.py` adds `GET/POST /__flow_wf_state` — every edit is debounced (2.5s) into a whole-tree backup at `~/.zcode/codex-manager/wf-backup.json` (atomic write), and after a `rev` re-seed or a lost browser store the editor __merges non-conflicting canvases back__ (deleted canvases never resurrect); selecting a 🤖 sub-agent node on the canvas now offers __"📄 view output"__ — a dialog with the agent metadata and the output (4,000-char preview plus __"📥 load full output"__ and copy; Qoder sub-agents are reassembled through the client-file endpoint); the workflow tree shows a __⏱ time-to-next-question chip__ on every small conversation and canvas question nodes carry the same badge (🤖 nodes inherit their anchor's duration); ⚙ settings gains a __model price__ section (per-model input / output / cache-read prices plus a "💰 fill common public prices" reference button) and the estimated cost appears in __four places__ — the token KPI cell, the per-client model table, the period-detail card and the line-chart hover tooltip (partially priced totals carry a `≈` prefix with an approximation note; with no prices configured the cell shows `—` and points to the settings);
- __"Tech-plain" visual rewrite & engineering micro-animations__ (v0.20.0): the whole UI is restyled on a restrained engineering palette — neutral grays with no blue cast (dark mode is now neutral near-black instead of navy), a unified __2px corner radius__ (3px on dialogs/overlays), __all shadows and hover-lift removed__ (hover turns borders accent instead), the selected sidebar row becomes an inset 2px accent bar, tabular numerals throughout, monospace (Consolas) KPIs / timestamps / paths, the canvas dot grid replaced by a __24px fine-line engineering grid__, dark terminal-style toasts & tooltips (square, thin border, monospace), thin scrollbars and underline section headers; the editor-generated SVG geometry follows suit (node `rx` 8→2, badges 7→2, sub-agent boxes 12→2, label plates 6→2, control-map boxes 10→2 — round start/end nodes keep their pill shape); CSS variable names, class names and selectors are all unchanged, so nothing breaks. The __micro-animations__ stay in the same restrained register (120–220ms, ease-out, opacity / outline / small offsets only): button press feedback, view fade-in with __staggered workflow cards__, toast slide-in, dialog / backdrop / inline-edit fade-ins, node & port hover accents, an accent __flash on newly created nodes and edges__ (indexed by `data-eg`, auto-cleared after 900ms, never replays on re-render), __KPI count-up__ from zero on first paint (`≈ $1.23` and thousands separators supported, `—` skipped), usage bars growing in, the token line chart __drawing itself in__ with staggered data dots, a constantly flowing dashed line on the control-flow relation map, `scroll-behavior: smooth`, and a full __`prefers-reduced-motion: reduce` fallback__ that disables everything (JS counters and smooth scrolling included);
- __Multi-workflow workbench__ with subflow nodes (`▸→name`, double-click to jump) and 8 logic gates (IF/AND/OR/NOT/NAND/NOR/XOR/XNOR) with rule validation;
- __Kind-aware validation v2__ (v0.10.0): inputs take no inbound edges, conditions need exactly two labeled branches, merges prefer multiple inputs, agents/maps need both edges, missing input/output nodes flagged — plus cycles, gate rules and reachability;
- __Dual AI prompt channels__: "🔗 optimize edges" (structure only: merges, branch labels, feedback loops, dedupe) and "🧠 optimize the whole flow"; current validation issues are attached automatically;
- __Text is the single source of truth__: Mermaid / Markdown / JSON tabs stay two-way synced; kinds/gates/subflows ride along as label suffixes; Markdown gains "execution order" (topological) and "node notes" (STEP docs) sections;
- __Two-way file sync__: File System Access API since v0.8.0 (resumable handles since v0.10.0); since v0.13.0 the default path is zero-click auto-connect via the `flow_serve.py` HTTP host — `/codex-flow-edit` writes the mermaid source to `flow-source.mmd`, the editor attaches to it on load with no browser permission prompt: edit the file in your IDE and the canvas redraws within ~1–2s; edit the canvas and it POSTs an atomic write-back (debounced, loop-protected). A plain HTTP server without the ping endpoint degrades to "👁 read-only"; when opened via file:// you can still click "🔗 connect file" manually (Edge/Chrome); since v0.18.0 the channel is pinned to the __main flow__ — conversation canvases are derived snapshots whose edits remain local, and deferred file updates land the moment you switch back to the main flow;
- __Comfortable editing__: undo/redo (60 steps), wheel pan + Ctrl+wheel zoom, duplicate/self-loop edge rejection, serpentine folding for >8-level linear chains, white theme by default with dark mode toggle (both themes restyled "tech-plain" since v0.20.0).

## Deployment & Usage Guide

### System Requirements

- ZCode desktop (a version that supports the plugin system), or any workbench compatible with the ZCode plugin manifest format.
- Node.js (hook script runtime, any LTS release).
- Python 3.10+ with openpyxl (only needed for Excel export; degrades to CSV automatically when missing).

### Get the Repository

```bash
git clone https://github.com/sanhansan/codex-manager.git
```

### Install the Plugin (either way)

- __Local directory (works everywhere)__ — Open ZCode → Plugin Marketplace → Add → Add Plugin Marketplace → select the cloned `codex-manager` folder (the one containing `marketplace.json`) → find Codex Manager under "Personal" → Install.
- __GitHub marketplace source__ — When adding a marketplace, enter `sanhansan/codex-manager` directly (requires a client that supports GitHub-type marketplace sources), then install from "Personal".

After installing, start a fresh task, trigger a few plugin skills, then run `/codex-usage` to verify that data collection is working.

### Command Cheat Sheet

| Command | Arguments | Effect |
| --- | --- | --- |
| `/codex-usage` | `[N]` (optional, last N days) | Print the usage breakdown and export an Excel report |
| `/codex-flow` | empty / `recent` / session-ID fragment | Flowchart for the current / latest / specified session |
| `/codex-flow-edit` | `[file or project]` | Open the visual flowchart editor (canvas + multi-client Q&A sync + Agent Skills + usage/token dashboard) |
| `/codex-review` | `[project]` | Question-driven process review; typed omit/optimize/keep recommendations |
| `/codex-optimize` | `[project]` | End-of-project retrospective + optimized prompt recommendations |
| `/codex-habit` | `[theme] [install]` | Personal habits → autonomously written skill (installable) |
| `/codex-flow-save` | `project [render]` | Save the session flow into the project framework; render images |
| `/codex-agents-review` | `[project]` | Three sub-agents review in parallel + cross-agent aggregation |
| `/codex-summary` | `project [--render]` | Final project aggregation (master flowchart + closed-loop report) |

## Important Notes

### Data & Privacy

- __What is collected__ — Only six metadata fields: timestamp, type, plugin name, skill/tool name, session ID and working directory. No conversation content.
- __Where it lives__ — Locally, at `~/.zcode/codex-manager/usage.jsonl`, one JSON object per line. Nothing is uploaded anywhere.
- __Wipe anytime__ — Delete the file to clear history; the hooks recreate it automatically.

### First Use

- An empty log right after installation is normal; reports build on real usage.
- Usage statistics only cover the period after this plugin was installed — past history cannot be backfilled.

### Session Log Parsing

- The workbench stores long sessions in a sliding window; the script joins "the last full snapshot + the most recent line". If a gap exists between the two covered ranges, a gap marker is emitted and diagrams should note "middle omitted" — this is intentional honesty, not a defect.
- Session files live under `~/.zcode/cli/rollout/` and can reach tens of megabytes; the parsing script is optimized for text-only scanning.

### Updating the Plugin

1. Pull the latest code: run `git pull` in the repository folder.
2. Check the version: confirm the version in the manifest (`.zcode-plugin/plugin.json`) is newer than the installed one.
3. Apply the update: ZCode → Marketplace Sources → refresh this marketplace → Personal → plugin details → Update. Source edits do not hot-reload; the marketplace refresh + update actions are mandatory.

## License & Component Notices

This project's own code is released under the MIT License. The Excel export depends on the open-source component openpyxl (MIT License); flowcharts use Mermaid syntax (rendered natively on GitHub / VS Code / mermaid.live); the plugin manifest and hook mechanisms follow the ZCode plugin framework specification.
