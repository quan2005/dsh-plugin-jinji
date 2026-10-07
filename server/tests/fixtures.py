"""Synthetic journal fixtures. No user journal or skill directories are read."""
import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def make_reader(temp):
    temp = Path(temp)
    journal = temp / 'journal'
    journal.mkdir()

    def put(pid, text):
        path = journal / pid
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
        return path

    put('AGENTS.md', '# Fixture journal\n')
    put('2610/06-产品-评审.md', '''---
tags:
  - journal
  - meeting
  - 工作
summary: 这是用于回归验证的会议结论，不包含真实用户资料。
sources:
  - 2610/raw/原始 素材.txt
  - ./raw/图 100%.svg
  - 2610/raw/missing.txt
  - https://example.invalid/source
source: 用户在会话中提供的文字
---
# 产品-评审

[成果](<06-测试报告/index.html>)

[根绝对图片](ROOT_IMAGE)

[失效链接](<../研究/旧目录/已移除.md>)

## 行动项

- [ ] 验证新结构

![示例](<raw/图 100%.svg>)
'''.replace('ROOT_IMAGE', '<' + str(journal / '2610/raw/图 100%.svg') + '>'))
    put('2610/06-产品-评审.html', '<!doctype html><title>成对 HTML</title><h1>成对 HTML</h1><p>paired-html-only</p><img src="raw/图%20100%25.svg">')
    put('2610/07-无类型-标题.md', '---\ntags: [journal, custom]\n---\n直接保留文件名中的完整标题。')
    put('2602/28-月末.md', '# 月末\n')
    put('2602/30-无效日期.md', '# 不应成为日志\n')
    put('2613/01-无效月份.md', '# 不应成为日志\n')
    put('2610/说明.md', '# 不应成为日志\n')
    put('2610/raw/原始 素材.txt', 'source evidence, not indexed')
    put('2610/raw/图 100%.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>')
    put('2610/raw/06-原始记录.md', '# 不索引 raw\n')
    put('2610/raw/book.md', '---\ntype: book\n---\n# 不应上架\n')
    put('identity/README.md', '---\ntype: person\ntags: [person, self]\n---\n# 测试本人（Fixture）\n')
    put('identity/组织-甲.md', '---\ntags: [person]\narchived: true\n---\n# 甲\n')
    put('identity/product-阅读器.md', '---\ntags: [product]\ntype: product\n---\n# 阅读器\n')
    put('2610/06-测试报告/index.html', '<!doctype html><title>成果报告</title><link rel="stylesheet" href="assets/style.css"><h1>成果报告</h1><p>artifact-search-token</p><img src="assets/picture.svg">')
    put('2610/06-测试报告/assets/style.css', 'h1 { color: rgb(1, 2, 3); }')
    put('2610/06-测试报告/assets/picture.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')
    put('2610/06-测试报告/附件.md', '# 附件\nartifact-markdown-token')
    for directory in ('raw', 'node_modules', '.workbuddy', '__pycache__', 'dist'):
        put(f'2610/06-测试报告/{directory}/secret.md', '# 不应索引\n')
    put('2610/06-工作大数据/00-index.md', '# 工作专题\n')
    put('2611/01-工作大数据/补充.md', '# 跨月专题\n')
    put('2610/06-专家智库/00-index.md', '# 智库文档\n')
    put('2610/06-人物思想与学习路径/报告.md', '# 思想报告\n')
    put('2610/06-书架/卡片/书.md', '''---
title: 测试书
type: "book"
book_source: ../书库/测试书/index.html
book_cover: ../书库/测试书/cover.svg
book_package: ../书库/测试书
book_text: ../书库/测试书/body.md
book_category: 测试
---
# 测试书
''')
    put('2610/06-书架/书库/测试书/index.html', '<!doctype html><title>测试书正文</title><h1>测试书正文</h1>')
    put('2610/06-书架/书库/测试书/cover.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')
    put('2610/06-书架/书库/测试书/body.md', '# 可检索正文\nbook-fulltext-token\n')
    put('.journal/memory/2610/06-旧日志.md', '# 旧结构不索引\n')
    put('.journal/identity/旧画像.md', '# 旧结构不索引\n')
    put('研究/书架/卡片/旧书.md', '---\ntype: book\n---\n# 旧结构不索引\n')
    put('.agents/skills/journal/SKILL.md', '---\nname: journal\ndescription: Fixture journal skill\n---\n# 只读技能\n')
    put('.agents/skills/local-expert/SKILL.md', '---\nname: local-expert\nmetadata:\n  kind: 专家\n  name: 本地专家\n---\n# 专家\n')
    global_skills = temp / 'global-skills'
    for name, text in {
        'global-expert': '---\nname: global-expert\nmetadata:\n  kind: 专家\n  name: 全局专家\n---\n# global-expert-token\n',
        'global-tool': '---\nname: global-tool\nmetadata:\n  kind: 工具\n---\n# global-tool-token\n',
        'top-level-kind': '---\nname: top-level-kind\nkind: 专家\n---\n# not-an-expert-token\n',
        'string-metadata': '---\nname: string-metadata\nmetadata: 专家\n---\n# not-an-expert-token\n',
    }.items():
        skill = global_skills / name / 'SKILL.md'
        skill.parent.mkdir(parents=True)
        skill.write_text(text, encoding='utf-8')
    config = json.loads((ROOT / 'server/wiki.config.example.json').read_text('utf-8'))
    config.update(journal=str(journal), skill_roots=[str(global_skills)], extra_roots=[], archive_file=str(temp / 'state/archive.json'), favorites_file=str(temp / 'state/favorites.json'))
    config_path = temp / 'config.json'
    config_path.write_text(json.dumps(config), encoding='utf-8')
    with patch.dict(os.environ, {'JINJI_CONFIG': str(config_path), 'JINJI_JOURNAL': str(journal), 'JINJI_PORT': '0', 'JINJI_STATE_DIR': str(temp / 'state')}, clear=False):
        spec = importlib.util.spec_from_file_location('jinji_fixture_server', ROOT / 'server/server.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module, put
