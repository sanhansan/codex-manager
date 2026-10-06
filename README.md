# Codex Manager

Plugin usage tracking & session flowcharts for Codex workbenches.

English | [简体中文](README.zh-CN.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-ZCode%20Plugin-green.svg)
![Runtime](https://img.shields.io/badge/runtime-Node.js%20%7C%20Python%203.x-yellow.svg)

This plugin targets Codex-style AI coding agent workbenches (built on the ZCode plugin ecosystem) and answers two questions that come up all the time: "Of all the plugins I've installed, which ones do I actually use?" and "How exactly did the AI get this task done, step by step?" With silent background hooks and one-command results, it keeps plugin usage and your working process fully visible — no extra effort required.

**Why it matters: a flowchart is not a picture, it is a review instrument.** When every session becomes a diagram, detours, repeated steps and wasted effort become visible at a glance — so you can audit the process, revise it, and make the next run faster. Codex Manager turns "see the flow → review it → improve it" into a habit, and the usage stats tell you whether each change actually helped.

> **Maintenance** — Actively maintained by [@sanhansan](https://github.com/sanhansan), last updated 2026-10-06. For bug reports or adaptation requests, please open an [Issue](https://github.com/sanhansan/codex-manager/issues).

## Download & Use the Release Packages

All versions are published on the [Releases](https://github.com/sanhansan/codex-manager/releases) page, released milestone by milestone:

| Version | Date | Contents | For whom |
| --- | --- | --- | --- |
| **v0.3.0 (latest, recommended)** | 2026-10-06 | Full: ZCode plugin (0.3.0) + OpenAI Codex CLI adapter + bilingual docs | Everything in one package |
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

A second adaptation target for the OpenAI Codex CLI (verified against codex-cli 0.157.1). Since Codex CLI has no hook system, the adapter achieves the same capabilities through three channels: scanning `~/.codex/sessions` rollout logs offline for usage stats; registering a standard-library-only MCP server exposing `codex_usage` / `codex_flow` / `codex_sessions` tools; and installing `/codex-usage` and `/codex-flow` custom commands. Metrics cover MCP server calls, native tools such as `exec`, built-in namespaces like `collaboration`, and token consumption (with honest annotation for compacted sessions).

```bash
powershell -ExecutionPolicy Bypass -File codex-cli-adapter/install.ps1   # Windows
./codex-cli-adapter/install.sh                                           # macOS / Linux
```

See [codex-cli-adapter/README.md](./codex-cli-adapter/README.md) for details.

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
