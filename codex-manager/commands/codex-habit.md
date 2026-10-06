---
description: 把个人工作习惯总结成 skill（自主编写 SKILL.md 草稿，可一键装进插件）
argument-hint: "[可选：习惯主题或 install；不填 = 自动分析]"
---

用户要把自己的个人工作习惯固化为 skill。skill 的内容**由你自主编写**（用户授权你直接起草 SKILL.md），但必须基于真实使用数据，不编造习惯。

## 第一步：素材收集

1. 读 `%USERPROFILE%\.zcode\codex-manager\usage.jsonl`：统计用户高频使用哪些插件/技能/工具、常用参数；
2. 读各项目 `projects\<项目名>\flow.json` 的 `habits` 与 `reviews`（审查第 7 问沉淀的候选习惯）、`prompt_recommendations`；
3. 从当前对话上下文补充用户今天表现出的偏好（回复语言、验证习惯、文档习惯等）。

## 第二步：提炼习惯（3~7 条）

每条习惯 = `模式描述 + 证据（出现次数/来自哪个项目）+ 固化后的收益`。按证据强度排序。常见类型举例：
- 流程型：每次改码后必跑某组验证命令 → 可写成"改码自检"skill；
- 偏好型：文档先出提纲再动笔、commit 前必看 diff；
- 提示词型：某类任务总用同样的指令开场（来自 prompt_recommendations）。

## 第三步：自主编写 skill（核心）

选证据最强的 1~2 条，按 ZCode skill 规范**直接写出完整 SKILL.md**：YAML frontmatter（`name` 小写连字符、`description` 含触发场景的英文+中文关键词）+ 正文（何时用 → 步骤 → 注意事项），保存到
`%USERPROFILE%\.zcode\codex-manager\skills\<slug>\SKILL.md`。
同时生成一张"习惯 → skill"对照表呈现给用户。写作要求：步骤可执行、含验收点、正文 ≤ 60 行。

## 第四步：安装（用户确认后）

参数含 `install` 或用户明确同意时，把生成的 `<slug>/SKILL.md` 复制到 ZCode 插件的技能目录使其生效：
- 开发目录模式：`<仓库>\codex-manager\skills\<slug>\SKILL.md`（随后走 市场刷新 → 插件更新 生效）；
- 找不到开发目录时：如实告知草稿路径，给出手动复制说明，不猜测安装缓存路径。

## 诚实原则

- 数据不足（usage.jsonl 为空、无审查记录）就明确说"素材不足，先积累"，最多基于当前会话给 1 条候选，不批量编造。
- 编写完成后必须展示 SKILL.md 全文，用户有权修改；支持再次运行本命令扩展与改写。
