# Agent 指引

这是一个由 AI 助手维护的个人笔记库，用谨迹书房（只读阅读器）浏览。你收到文字素材（会议转写、文档、网页、对话）后，把它整理成结构化日志，并维护 `identity/` 里的人物与产品档案。

## 目录

```
AGENTS.md            ← 本文件
yyMM/                ← 年月，如 2610 = 2026 年 10 月
  raw/               ← 原始素材，只读
  DD-title.md        ← 日志
  DD-title.html      ← 日志的可视化版本（可选，与日志同名）
  DD-title/          ← 这篇日志的成品与附件
identity/
  README.md          ← 用户本人
  {组织}-{姓名}.md   ← 人物
  product-{名称}.md  ← 产品
.agents/
  refs/templates/    ← 人物、产品档案模板
```

新内容都归入某个 `yyMM/` 或 `identity/`。

## 工作流

1. **读素材**：提取时间、人物、产品、结论、决策、待办和不确定处；读 `identity/README.md` 和相关档案补上下文。
2. **定位**：日期取素材发生的日期，判断不出时用今天。同一天同一主题已有日志就追加，否则新建 `yyMM/DD-标题.md`。
3. **写日志**：按下面的格式写，结论先行。
4. **放成品**：文章、网页、图片等产出放进同名目录 `DD-title/`，日志里用相对路径链接。
5. **更新档案**：日志里出现值得记录的人或产品时，按 `.agents/refs/templates/` 的模板更新已有档案或新建。

## 日志格式

```yaml
---
tags: [journal, meeting]
summary: 一句话结论，读完就知道这篇最重要的是什么。
sources: [2610/raw/会议转写.txt]
---
```

- `tags` 第一个固定为 `journal`，后面写类型和主题，如 `meeting`、`report`、`research`、`learning`。
- 正文用标准 Markdown；对比、风险、行动项用表格，原话用 `>` 引用并注明说话人。
- 素材没说清的内容标「（待确认）」，集中列到文末「待确认」一节。

## 档案格式

- 人物：`identity/{组织}-{姓名}.md`，frontmatter 写 `type: person` 和一句话 `summary`。档案回答「下次和 ta 打交道前该知道什么」，按维度组织，不按日期记流水；会议细节留在日志。
- 产品：`identity/product-{名称}.md`，frontmatter 写 `type: product`。
- 用户本人：`identity/README.md`，`type: person`，`tags` 含 `self`。

## 书

一本 HTML 书放成 `yyMM/DD-书名.html`，同名 `DD-书名.md` 作为书卡：frontmatter 写 `type: book`、`title`、`book_source: "DD-书名.html"`、`reading_status`（unread / reading / read / paused / unknown），正文先写导读。

## 需要用户确认的操作

- 删除文件、移动目录、批量改名：先列清单，等用户同意。
- `raw/` 里的素材保持原样。

## 经验

用户纠正处理结果、或说「记住」「下次别这样」时，把教训用一两句追加到本节。
