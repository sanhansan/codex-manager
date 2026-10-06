---
description: 项目最终汇总：把持续搭建的流程框架、审查发现、智能体总结汇成一份总报告与总流程图
argument-hint: "项目名 [--render 渲染图片]"
---

用户要对一个持续搭建的项目做**最终汇总**。这是"持续总结搭建 → 最后汇总"的收口动作。

## 第一步：读全量框架

读 `%USERPROFILE%\.zcode\codex-manager\projects\<项目名>\flow.json` 的全部字段：`versions`（各次搭建）、`stages`（累计阶段）、`reviews`（审查推荐）、`habits`、`prompt_recommendations`、`agent_summaries`（跨智能体总结）。文件不存在则如实告知并停止。

## 第二步：生成总流程图

把 `stages`（按 count 降序、保留原始先后）合成一张**总流程图**（mermaid `flowchart TD`）：主链路 = 核心阶段串行；标注每阶段累计调用次数；`reviews` 中标记为【可省】且已确认的阶段用虚线/删除线节点表示"待裁剪"；`agent_summaries.top_actions` 中已完成的打勾。图要体现**项目从初版到现在的演化**，可在节点备注版本来源。

## 第三步：写汇总报告

`<项目名>-summary-<YYYYMMDD>.md`，结构：

1. **项目画像**：搭建次数、时间跨度、累计阶段数、工具调用总量；
2. **总流程图**：mermaid 代码块；
3. **审查闭环**：历次 reviews + agent_summaries 的发现 → 哪些已采纳、哪些待办（对照表）；
4. **习惯与技能**：habits 清单及已固化成 skill 的部分；
5. **提示词资产**：prompt_recommendations 中最终保留的模板；
6. **下一阶段建议**：基于以上给出的 3 条以内改进方向。

## 第四步：渲染与落盘

- 报告存入 `projects\<项目名>\summaries\`，总流程图同时保存 `.md` 与 mermaid 源；
- 参数含 `--render` 时按 `/codex-flow-save` 第三步的渲染链（kroki → mmdc → AI 生图 → 手动）输出 PNG；
- 回复中内嵌总流程图 mermaid 与报告要点，给出全部文件路径。

## 诚实原则

汇总必须逐项引用 flow.json 里的真实记录；空的字段如实写"无记录"；报告中的"已采纳"只能标注用户明确确认过的事项。
