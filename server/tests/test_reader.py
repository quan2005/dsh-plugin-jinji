"""Run: python3 -m unittest discover -s server/tests -v"""
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from fixtures import make_reader


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jinji-unit-')
        self.addCleanup(self.temp.cleanup)
        self.m, self.put = make_reader(self.temp.name)
        self.idx = self.m.build_index()

    def test_monthly_timeline_and_titles(self):
        rows = self.idx['items']['journal']
        self.assertEqual([x['date'] for x in rows], ['2026-10-07', '2026-10-06', '2026-02-28'])
        self.assertEqual(rows[0]['title'], '无类型-标题')
        self.assertEqual(rows[0]['kind'], '')
        self.assertEqual(rows[1]['kind'], '会议')
        self.assertEqual(rows[1]['tags'], ['journal', 'meeting', '工作'])

    def test_same_name_md_html_are_one_log(self):
        rows = self.idx['items']['journal']
        paired = next(x for x in rows if x['path'] == '2610/06-产品-评审.md')
        self.assertEqual(paired['variants'], {'markdown': paired['path'], 'html': '2610/06-产品-评审.html'})
        self.assertFalse(any(x['path'].endswith('评审.html') for x in rows))
        self.assertEqual(self.m.search('paired-html-only')[0]['path'], paired['path'])
        self.m.set_archived('2610/06-产品-评审.html', True)
        self.assertTrue(self.m.load_archive()[paired['path']])
        self.assertNotIn('2610/06-产品-评审.html', self.m.load_archive())
        self.put('2611/01-仅HTML.html', '<h1>仅 HTML</h1>')
        self.put('2611/02-不同标题.md', '# 不配对')
        self.put('2611/03-不同标题.html', '<h1>不配对</h1>')
        self.assertEqual(len(self.m.build_timeline({})), 6)
        self.assertEqual(self.m.journal_variants(self.m.JOURNAL / '2610/06-测试报告/index.html'), {})

    def test_portraits_and_self(self):
        people = self.idx['items']['people']
        self.assertEqual(len(people), 2)
        self.assertEqual(people[0]['group'], '我')
        self.assertEqual(people[0]['display'], '测试本人')
        self.assertTrue(people[1]['archived'])
        self.assertEqual(self.idx['items']['products'][0]['display'], '阅读器')

    def test_six_categories_without_artifact_or_special_directory_index(self):
        self.assertEqual([c['id'] for c in self.idx['categories']], ['focus', 'people', 'products', 'shelf', 'journal', 'experts'])
        self.assertEqual([c['id'] for c in self.idx['categories'] if c.get('featured')], ['focus'])
        self.assertNotIn('artifacts', self.idx['items'])
        self.assertEqual(self.idx['items']['experts'], [])
        paths = [x['path'] for rows in self.idx['items'].values() for x in rows]
        self.assertFalse(any('/raw/' in p or p.startswith(('.journal/', '研究/')) for p in paths))
        self.assertFalse(any('secret.md' in p or '/06-工作大数据/' in p or '/06-专家智库/' in p for p in paths))
        self.assertTrue(self.m.resolve_id('2610/06-测试报告/index.html').is_file())

    def test_focus_is_exact_tagged_timeline_view(self):
        self.put('2611/01-普通标题.md', '---\ntags: [journal, 工作]\n---\n# 跨月日志')
        self.put('2611/02-工作.md', '# 工作\n标题和正文不能代替标签')
        self.put('2611/03-近似标签.md', '---\ntags: [异世界, 工作大数据]\n---\n# 近似标签')
        self.put('2610/06-工作大数据/有标签.md', '---\ntags: [工作]\n---\n# 不是日志流水')
        idx = self.m.build_index()
        rows = idx['items']['focus']
        self.assertEqual([x['path'] for x in rows], ['2611/01-普通标题.md', '2610/06-产品-评审.md'])
        self.assertEqual(rows, [x for x in idx['items']['journal'] if '工作' in x['tags']])
        self.assertEqual(len(idx['recent']), len({x['path'] for x in idx['recent']}))
        self.m.set_archived(rows[0]['path'], True)
        idx = self.m.build_index()
        self.assertTrue(idx['items']['focus'][0]['archived'])
        self.assertTrue(next(x for x in idx['items']['journal'] if x['path'] == rows[0]['path'])['archived'])
        self.assertEqual(next(c for c in idx['categories'] if c['id'] == 'focus')['count'], 1)

    def test_experts_only_global_metadata_kind(self):
        experts = self.idx['experts']['experts']
        self.assertEqual([e['id'] for e in experts], ['global-expert'])
        self.assertNotIn('card', experts[0])
        self.assertEqual(experts[0]['skill_info']['meta']['kind'], '专家')
        self.assertEqual(next(c for c in self.idx['categories'] if c['id'] == 'experts')['count'], 1)
        # 其他全局技能单列，不计入专家；journal 内的技能不出现。
        self.assertEqual([k['id'] for k in self.idx['experts']['skills']], ['global-tool', 'string-metadata', 'top-level-kind'])
        self.assertNotIn('meta', self.idx['experts']['skills'][0])
        self.assertEqual(self.m.search('global-expert-token')[0]['cat'], 'experts')
        self.assertEqual(self.m.search('global-tool-token')[0]['path'], self.idx['experts']['skills'][0]['path'])
        self.assertEqual(len(self.m.search('not-an-expert-token')), 2)

    def test_index_is_slim_versioned_and_archive_is_incremental(self):
        journal = self.idx['items']['journal']
        self.assertTrue(all('fm' not in x for x in journal))
        self.assertTrue(self.idx['version'])
        again = self.m.build_index()
        self.assertEqual(again['version'], self.idx['version'])
        self.m._index.update(data=self.idx, at=__import__('time').time())
        calls = []
        original = self.m.build_index
        self.m.build_index = lambda: calls.append(1) or original()
        try:
            result = self.m.set_archived('2610/06-产品-评审.md', True)
        finally:
            self.m.build_index = original
        self.assertEqual(calls, [], 'archive must reuse the cached index')
        cached = self.m._index['data']
        self.assertNotEqual(cached['version'], self.idx['version'])
        self.assertEqual(result['version'], cached['version'])
        self.assertTrue(next(x for x in cached['items']['journal'] if x['path'] == '2610/06-产品-评审.md')['archived'])
        self.assertEqual(next(c for c in cached['categories'] if c['id'] == 'focus')['count'], 0)
        self.assertNotIn('2610/06-产品-评审.md', [x['path'] for x in cached['recent']])
        self.assertEqual(cached['version'], self.m.build_index()['version'])

    def test_html_theme_injection(self):
        inject = self.m.inject_theme
        tag = self.m.THEME_TAG
        self.assertEqual(inject(b'<!doctype html><html lang="zh"><head><title>x</title>'),
                         b'<!doctype html><html lang="zh"><head>' + tag + b'<title>x</title>')
        self.assertEqual(inject(b'<!DOCTYPE html><p>x'), b'<!DOCTYPE html>' + tag + b'<p>x')
        self.assertEqual(inject(b'<h1>x</h1>'), tag + b'<h1>x</h1>')
        self.assertEqual(inject(b'\xef\xbb\xbf<h1>x</h1>'), b'\xef\xbb\xbf' + tag + b'<h1>x</h1>')

    def test_books_resolve_relative_bundle(self):
        books = self.idx['items']['shelf']
        self.assertEqual(len(books), 1)
        for key in ('entry', 'cover', 'text', 'package'):
            self.assertTrue(books[0][key].startswith('2610/06-书架/书库/测试书'))
            self.assertTrue(self.m.resolve_id(books[0][key]).exists())

    def test_same_name_book_card_holds_full_text(self):
        self.put('2611/05-同名书.md', '---\ntype: book\ntitle: 同名书\nbook_source: "05-同名书.html"\n---\n\n# 同名书\n\n## 导读\n\n导读\n\n'
                 '<!-- book-text：以下为全书 Markdown 正文 -->\n\nsame-name-fulltext-token\n')
        self.put('2611/05-同名书.html', '<h1>同名书</h1>')
        self.put('2611/05-同名书/图.png', 'png')
        self.put('2611/06-无书包.md', '---\ntype: book\ntitle: 无书包\nbook_source: "06-无书包.html"\n---\n')
        self.put('2611/06-无书包.html', '<h1>无书包</h1>')
        books = {b['path']: b for b in self.m.build_index()['items']['shelf']}
        self.assertEqual(books['2611/05-同名书.md']['package'], '2611/05-同名书')
        self.assertEqual(books['2611/06-无书包.md']['package'], '')
        self.assertEqual(self.m.search('same-name-fulltext-token')[0]['path'], '2611/05-同名书.md')

    def test_search_only_indexed_entries(self):
        self.assertEqual(self.m.search('artifact-search-token'), [])
        self.assertEqual(self.m.search('book-fulltext-token')[0]['cat'], 'shelf')
        self.assertEqual(self.m.search('会议结论')[0]['cat'], 'focus')
        self.assertEqual(len(self.m.search('会议结论')), 1)
        self.assertEqual(self.m.search('source evidence'), [])

    def test_sources_and_frontmatter_lists(self):
        path = self.m.JOURNAL / '2610/06-产品-评审.md'
        fm, body = self.m.parse_frontmatter(path.read_text('utf-8'))
        sources = self.m.source_links(fm, path)
        self.assertEqual(len(sources), 5)
        self.assertEqual(sources[0]['path'], '2610/raw/原始 素材.txt')
        self.assertTrue(sources[0]['available'])
        self.assertTrue(sources[1]['available'])
        self.assertFalse(sources[2]['available'])
        self.assertEqual(sources[3]['url'], 'https://example.invalid/source')
        self.assertNotIn('path', sources[4])
        parsed, _ = self.m.parse_frontmatter('---\nsources:\n- 2610/raw/a,b.txt\n- 2610/raw/c.txt\nsummary: >\n  第一行\n  第二行\n---\n# 正文')
        self.assertEqual(len(parsed['sources']), 2)
        self.assertEqual(parsed['summary'], '第一行 第二行')

    def snapshot(self):
        return {str(p.relative_to(self.m.JOURNAL)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.m.JOURNAL.rglob('*') if p.is_file()}

    def test_archive_outside_journal_and_readonly_skills(self):
        before = self.snapshot()
        pid = '2610/06-产品-评审.md'
        self.m.set_archived(pid, True)
        self.assertTrue(self.m.load_archive()[pid])
        self.m.set_archived('identity/组织-甲.md', False)
        self.assertFalse(self.m.load_archive()['identity/组织-甲.md'])
        with self.assertRaises(self.m.MarkError):
            self.m.mark_expert('journal')
        with self.assertRaises(self.m.MarkError):
            self.m.rename_expert('local-expert', '新名字')
        self.assertNotIn('local-expert', [s['id'] for s in self.m.build_skills()])
        self.assertNotIn('journal', [s['id'] for s in self.m.build_skills()])
        with self.assertRaises(self.m.MarkError):
            self.m._edit_frontmatter(self.m.JOURNAL / '.agents/skills/local-expert/SKILL.md', lambda lines, end: None)
        self.assertEqual(before, self.snapshot())
        self.m.ARCHIVE_FILE = self.m.JOURNAL / '_系统/wiki/archive.json'
        with self.assertRaises(self.m.MarkError):
            self.m.set_archived(pid, False)
        self.assertFalse((self.m.JOURNAL / '_系统').exists())

    def test_favorites_outside_journal_and_cover_all_kinds(self):
        before = self.snapshot()
        self.assertEqual(self.idx['favorites'], [])
        skill = self.idx['experts']['skills'][0]['path']
        expert = self.idx['experts']['experts'][0]['skill_info']['path']
        for pid in ('2610/06-产品-评审.html', 'identity/组织-甲.md', '2610/06-书架/卡片/书.md', skill, expert,
                    '2610/06-测试报告/附件.md'):
            self.m.set_favorite(pid, True)
        favorites = self.m.load_favorites()
        self.assertIn('2610/06-产品-评审.md', favorites, 'paired HTML is saved on the Markdown log')
        self.assertNotIn('2610/06-产品-评审.html', favorites)
        rows = {r['path']: r for r in self.m.build_index()['favorites']}
        self.assertEqual(rows['2610/06-产品-评审.md']['cat'], 'focus')
        self.assertEqual(rows['identity/组织-甲.md']['cat'], 'people')
        self.assertEqual(rows['2610/06-书架/卡片/书.md']['cat'], 'shelf')
        self.assertEqual(rows[skill]['cat'], 'experts')
        self.assertEqual(rows[expert]['title'], '全局专家')
        self.assertIsNone(rows['2610/06-测试报告/附件.md']['cat'])
        self.assertFalse(rows['2610/06-测试报告/附件.md']['missing'])
        # 收藏与归档相互独立；已归档条目仍保留收藏。
        self.assertTrue(next(x for x in self.idx['items']['people'] if x['path'] == 'identity/组织-甲.md')['archived'])
        with self.assertRaises(self.m.MarkError):
            self.m.set_favorite('2610/不存在.md', True)
        with self.assertRaises(self.m.MarkError):
            self.m.set_favorite('../config.json', True)
        self.m.set_favorite('identity/组织-甲.md', False)
        self.assertNotIn('identity/组织-甲.md', self.m.load_favorites())
        (self.m.JOURNAL / '2610/06-测试报告/附件.md').unlink()
        missing = next(r for r in self.m.build_index()['favorites'] if r['path'] == '2610/06-测试报告/附件.md')
        self.assertTrue(missing['missing'])
        self.m.set_favorite('2610/06-测试报告/附件.md', False)
        self.assertNotIn('2610/06-测试报告/附件.md', self.m.load_favorites())
        self.assertTrue(self.m.FAVORITES_FILE.is_file())
        after = self.snapshot()
        after['2610/06-测试报告/附件.md'] = before['2610/06-测试报告/附件.md']
        self.assertEqual(before, after)
        self.m.FAVORITES_FILE = self.m.JOURNAL / '_系统/favorites.json'
        with self.assertRaises(self.m.MarkError):
            self.m.set_favorite(skill, True)
        self.assertFalse((self.m.JOURNAL / '_系统').exists())

    def test_favorite_is_incremental_and_changes_version(self):
        self.m._index.update(data=self.idx, at=__import__('time').time())
        calls = []
        original = self.m.build_index
        self.m.build_index = lambda: calls.append(1) or original()
        try:
            result = self.m.set_favorite('2610/07-无类型-标题.md', True)
        finally:
            self.m.build_index = original
        self.assertEqual(calls, [], 'favorite must reuse the cached index')
        self.assertNotEqual(result['version'], self.idx['version'])
        self.assertEqual([r['path'] for r in result['favorites']], ['2610/07-无类型-标题.md'])
        self.assertEqual(result['version'], self.m.build_index()['version'])

    def test_path_escape_not_allowed(self):
        self.assertIsNone(self.m.resolve_id('../config.json'))
        link = self.m.JOURNAL / '2610/06-测试报告/escape.md'
        link.symlink_to(Path(self.temp.name) / 'config.json')
        self.assertIsNone(self.m.resolve_id(str(link)))
        self.assertFalse(any(x['name'] == 'escape.md' for x in self.m.build_docs({'kind': 'docs', 'include': ['2610/06-测试报告/*.md']})))

    def test_http_raw_resources_doc_cite_and_missing(self):
        server = self.m.ThreadingHTTPServer(('127.0.0.1', 0), self.m.Handler)
        self.m.PORT = server.server_port
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        before = self.snapshot()
        try:
            pid = '2610/06-产品-评审.md'
            with urlopen(base + '/api/doc?path=' + quote(pid)) as r:
                doc = json.load(r)
            self.assertEqual(doc['abs'], str(self.m.JOURNAL / pid))
            self.assertEqual(len(doc['sources']), 5)
            self.assertTrue(doc['source'].startswith('---\n'))
            self.assertEqual(doc['variants']['html'], '2610/06-产品-评审.html')
            with urlopen(base + '/api/doc?path=' + quote(doc['variants']['html'])) as r:
                html_doc = json.load(r)
            self.assertEqual(html_doc['variants']['markdown'], doc['path'])
            for pid in ('2610/06-测试报告/index.html', '2610/06-测试报告/assets/style.css', '2610/raw/图 100%.svg'):
                with urlopen(base + '/raw/' + quote(pid)) as r:
                    self.assertEqual(r.status, 200)
                    body = r.read()
                    self.assertEqual(body.startswith(self.m.THEME_TAG) or self.m.THEME_TAG in body, pid.endswith('.html'))
            with urlopen(base + '/api/index') as r:
                version = json.load(r)['version']
            with urlopen(base + '/api/index?since=' + version) as r:
                self.assertEqual(json.load(r), {'unchanged': True, 'version': version, 'built_ms': self.m._index['data']['built_ms']})
            request = Request(base + '/api/cite', data=json.dumps({'path': '2610/06-产品-评审.md', 'delivery': 'parent'}).encode(), headers={'Content-Type': 'application/json'})
            with urlopen(request) as r:
                result = json.load(r)
            self.assertFalse(result['queued'])
            self.assertEqual(self.m._cite_queue, [])
            self.assertEqual(result['item']['path'], '2610/06-产品-评审.md')
            with self.assertRaises(HTTPError) as error:
                urlopen(base + '/api/doc?path=' + quote('.journal/memory/2610/missing.md'))
            self.assertEqual(error.exception.code, 404)
            request = Request(base + '/api/archive', data=json.dumps({'path': '2610/06-产品-评审.md'}).encode(), headers={'Content-Type': 'application/json', 'Origin': 'http://evil.invalid'})
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 403)
            request = Request(base + '/api/favorite', data=json.dumps({'path': '2610/06-产品-评审.md'}).encode(), headers={'Content-Type': 'application/json', 'Origin': 'http://evil.invalid'})
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 403)
            request = Request(base + '/api/favorite', data=json.dumps({'path': '2610/06-产品-评审.md'}).encode(), headers={'Content-Type': 'application/json', 'Origin': base})
            with urlopen(request) as r:
                self.assertEqual(json.load(r)['favorites'][0]['path'], '2610/06-产品-评审.md')
            self.assertEqual(before, self.snapshot())
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
