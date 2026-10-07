"""Run: python3 server/tests/browser_monthly.py (Playwright + Chromium required).
All journal content is generated in a temporary directory. Only Markdown CDN
libraries are vendored; rendering is also tested with external network blocked.
"""
import tempfile
import threading
from urllib.parse import quote
from playwright.sync_api import sync_playwright
from fixtures import make_reader

with tempfile.TemporaryDirectory(prefix='jinji-monthly-browser-') as temp:
    module, put = make_reader(temp)
    triggers = ['指标口径没人裁决', '平台上线没人用', '业务与 IT 责任脱节', '备注含 "引号" & <标签>']
    scenario_skill = module.SKILL_ROOTS[0] / 'scenario-expert/SKILL.md'
    scenario_skill.parent.mkdir(parents=True)
    scenario_skill.write_text('''---
name: scenario-expert
metadata:
  kind: 专家
  name: 场景专家
  type: 人物
  familiarity: 已有参照
  triggers: [''' + ', '.join(f"'{text}'" for text in triggers) + ']\n---\n# 场景专家\n')
    # 主题跟随：三种常见写法 + 只有浅色的页面。
    put('2610/08-媒体查询主题.html', '<!doctype html><html><head><style>body{background:rgb(255,255,255)}@media (prefers-color-scheme: dark){body{background:rgb(0,0,0)}}</style></head><body><h1>媒体查询</h1><script>window.seen=matchMedia("(prefers-color-scheme: dark)").matches</script></body></html>')
    put('2610/08-属性主题.html', '<!doctype html><html data-theme="light"><head><style>[data-theme="light"] body{background:rgb(255,255,255)}[data-theme="dark"] body{background:rgb(0,0,0)}</style></head><body><h1>属性</h1></body></html>')
    put('2610/08-存储主题.html', '<!doctype html><html><head><style>body{background:rgb(255,255,255)}html.dark body{background:rgb(0,0,0)}</style><script>if((localStorage.getItem("theme")||"light")==="dark")document.documentElement.classList.add("dark")</script></head><body><h1>存储</h1></body></html>')
    put('2610/08-仅浅色.html', '<!doctype html><html><head><style>body{background:rgb(250,250,250)}.slide.dark{color:red}</style></head><body><h1>仅浅色</h1></body></html>')
    server = module.ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
    module.PORT = server.server_port
    base = f'http://127.0.0.1:{server.server_port}'
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script("""if (!localStorage.getItem('fixture-seeded')) {
              localStorage.setItem('fixture-seeded', '1');
              localStorage.setItem('jinji.reader:standalone', JSON.stringify({hash:'#/c/journal/doc/.journal%2Fmemory%2F2610%2Fold.md', filter:{journal:'old'}}));
              localStorage.setItem('jinji.history', JSON.stringify([{cat:'journal',mode:'doc',path:'.journal/memory/2610/old.md',title:'旧历史'}]));
            }""")
            page.goto(base)
            page.locator('.tile').first.wait_for()
            assert page.locator('.tile').count() == 5
            assert page.locator('.mainline').count() == 0
            assert page.locator('[href="#/c/artifacts"]').count() == 0
            assert page.locator('#main').get_by_text('旧历史', exact=True).count() == 0
            assert not page.url.endswith('old.md')
            print('PASS: five categories, no tag mainline or artifacts entrance; old state is not restored')
            page.goto(base + '/#/c/artifacts')
            page.locator('.tile').first.wait_for()
            assert page.url.endswith('#/')
            page.locator('.tile[href="#/c/journal"]').click()
            page.locator('.tl li').first.wait_for()
            page.locator('.tl .tt').filter(has_text='产品-评审').click()
            page.locator('.doc-title').wait_for()
            assert '#/c/journal/doc/' in page.url
            assert '日志流水' in page.locator('.crumbs').inner_text()
            assert page.locator('[data-act=doc-view]').all_text_contents() == ['原文', '预览', 'HTML']
            page.locator('[data-view=source][data-act=doc-view]').click()
            page.locator('.src-view .src').wait_for()
            assert page.locator('.src .ln .c').first.inner_text() == '---'
            assert '[成果]' in page.locator('.src').inner_text()
            page.locator('[data-view=html][data-act=doc-view]').click()
            page.frame_locator('#frame').locator('h1').filter(has_text='成对 HTML').wait_for()
            assert page.locator('.doc-head [data-act=cite]').get_attribute('data-path') == '2610/06-产品-评审.html'
            assert page.frame_locator('#frame').locator('img').evaluate('(img)=>img.complete && img.naturalWidth > 0')
            page.reload()
            page.frame_locator('#frame').locator('h1').filter(has_text='成对 HTML').wait_for()
            page.goto(base + '/#/c/journal/doc/' + quote('2610/06-产品-评审.html', safe=''))
            page.locator('[data-view=preview][data-act=doc-view]').click()
            page.locator('.doc-sources').wait_for()
            assert page.locator('.doc-head [data-act=cite]').get_attribute('data-path') == '2610/06-产品-评审.md'
            print('PASS: paired log switches source/preview/HTML, retains mode and resolves direct HTML links')
            page.goto(base + '/#/')
            page.locator('.tile').first.wait_for()
            print('PASS: removed category returns Home; tagged timeline retains its category on open')

            page.locator('.tile[href="#/c/journal"]').click()
            page.locator('.tl li').first.wait_for()
            assert page.locator('.tl li').count() == 7  # 3 篇日志 + 4 个主题夹具 HTML
            page.locator('#side-filter').fill('产品-评审')
            page.locator('#side-list .row').click()
            page.locator('.doc-sources').wait_for()
            assert page.locator('.doc-sources li').count() == 5
            page.locator('.doc-sources summary').click()
            page.locator('.doc-sources a').filter(has_text='原始 素材.txt').click()
            page.locator('.code-view').wait_for()
            assert 'source evidence' in page.locator('.code-view').inner_text()
            print('PASS: frontmatter source list opens root-relative raw material')

            pid = '2610/06-产品-评审.md'
            page.goto(base + '/#/c/journal/doc/' + quote(pid, safe=''))
            page.locator('#prose').wait_for()
            if page.evaluate('Boolean(window.marked && window.DOMPurify)'):
                image = page.locator('#prose img')
                image.wait_for()
                assert image.evaluate('(img) => img.complete && img.naturalWidth > 0')
                page.locator('#prose a').filter(has_text='根绝对图片').click()
                page.locator('.media-view img').wait_for()
                page.goto(base + '/#/c/journal/doc/' + quote(pid, safe=''))
                page.locator('#prose a').filter(has_text='失效链接').click()
                page.locator('.err').filter(has_text='不重定向旧路径').wait_for()
                print('PASS: Markdown images, encoded paths and explicit missing-link error')
            else:
                assert 'Markdown 渲染库没加载上' in page.locator('#prose').inner_text()
                print('LIMITATION: CDN unavailable; Markdown fallback verified, link-rendering checks skipped')

            page.goto(base + '/#/c/journal/doc/' + quote('2610/06-测试报告/index.html', safe=''))
            frame = page.frame_locator('#frame')
            frame.locator('h1').wait_for()
            assert frame.locator('h1').evaluate('(el) => getComputedStyle(el).color') == 'rgb(1, 2, 3)'
            assert frame.locator('img').evaluate('(img) => img.complete && img.naturalWidth > 0')
            print('PASS: artifact HTML preserves relative stylesheet and image resources')

            page.goto(base + '/#/c/shelf')
            page.locator('.book').click()
            page.locator('.book-hero .btn.primary').click()
            page.frame_locator('#frame').locator('h1').filter(has_text='测试书正文').wait_for()
            print('PASS: monthly book card opens its relative HTML book')

            page.goto(base + '/#/c/experts')
            page.locator('.hero').wait_for()
            assert page.locator('.skill-tile [data-act=mark-expert]').count() == 3
            assert page.locator('.expert.card').count() == 2
            assert page.locator('#side-list .row[data-key="e:local-expert"]').count() == 0
            assert '工具技能' not in page.locator('#main').inner_text()
            assert '相关文档' not in page.locator('#main').inner_text()
            print('PASS: experts only include global skills with metadata.kind 专家')

            scenario_row = page.locator('#side-list .row[data-key="e:scenario-expert"]')
            scenario_meta = scenario_row.locator('.m')
            note = ' / '.join(triggers)
            assert scenario_meta.inner_text() == note
            assert scenario_meta.get_attribute('title') == note
            assert scenario_meta.locator('*').count() == 0
            assert page.locator('.expert .trig').inner_text() == note
            assert page.locator('#side-list .row[data-key="e:global-expert"] .m').inner_text() == '候选'
            for width in (1280, 1920, 3840):
                page.set_viewport_size({'width': width, 'height': 1000})
                assert scenario_meta.evaluate('''el => {
                  const css = getComputedStyle(el);
                  const row = el.closest('.row');
                  const side = document.querySelector('#side-list');
                  return css.display === 'block' && css.whiteSpace === 'nowrap'
                    && css.textOverflow === 'ellipsis' && css.overflow === 'hidden'
                    && el.scrollWidth > el.clientWidth
                    && row.scrollWidth <= row.clientWidth + 1
                    && side.scrollWidth <= side.clientWidth + 1;
                }''')
            page.set_viewport_size({'width': 1440, 'height': 1000})
            assert page.locator('.skill-tile').count() == 3
            assert page.locator('#side-list .row[data-key="s:global-tool"]').count() == 1
            page.locator('.skill-tile').filter(has_text='global-tool').click()
            page.locator('#prose').filter(has_text='global-tool-token').wait_for()
            assert page.locator('.doc-head [data-act=cite]').get_attribute('data-path').endswith('global-tool/SKILL.md')
            assert '#/c/experts/s/global-tool' in page.url
            page.goto(base + '/#/c/experts')
            page.locator('.hero').wait_for()
            print('PASS: other global skills listed separately with their own detail page')
            page.locator('#side-filter').fill('业务与 IT 责任脱节')
            assert page.locator('#side-list .row').count() == 1
            assert scenario_meta.inner_text() == note
            scenario_row.locator('.t').click()
            page.locator('.doc-title [data-name-for="scenario-expert"]').wait_for()
            assert 'active' in scenario_row.get_attribute('class')
            assert '已有参照' in page.locator('.doc-meta').inner_text()
            assert scenario_row.locator('[data-act=cite]').get_attribute('data-path') == str(scenario_skill)
            main_text = page.locator('#main').inner_text()
            assert '方法卡' not in main_text and '什么时候请教' in main_text
            assert page.locator('.ex-ask li').count() == len(triggers)
            page.wait_for_function("!document.querySelector('#prose .loading') && !document.querySelector('#sk-files .muted:only-child')?.textContent.includes('读取中')")
            assert '场景专家' not in page.locator('#prose').inner_text(), 'duplicate title heading must be removed'
            assert page.locator('#sk-files').inner_text().strip()
            page.locator('#side-filter').fill('')
            print('PASS: expert notes match cards, escape text, truncate with full tooltip, filter and retain navigation/fallback')

            # 宽屏：所有详情页共用开关，刷新后保留。
            page.set_viewport_size({'width': 2560, 'height': 1200})
            page.goto(base + '/#/c/journal/doc/' + quote(pid, safe=''))
            page.locator('[data-view=preview][data-act=doc-view]').click()
            page.locator('#prose .doc-sources').wait_for()
            narrow = page.locator('#prose').evaluate('el => el.getBoundingClientRect().width')
            page.locator('.doc-head [data-act=wide]').click()
            wide = page.locator('#prose').evaluate('el => el.getBoundingClientRect().width')
            assert wide > narrow * 1.5, (narrow, wide)
            page.goto(base + '/#/c/experts/e/scenario-expert')
            page.locator('.ex-lead').wait_for()
            assert page.locator('.doc-head [data-act=wide]').get_attribute('aria-pressed') == 'true'
            expert_wide = page.locator('.sk-main .prose').evaluate('el => el.getBoundingClientRect().width')
            page.locator('.doc-head [data-act=wide]').click()
            expert_narrow = page.locator('.sk-main .prose').evaluate('el => el.getBoundingClientRect().width')
            assert expert_narrow <= narrow + 2 and expert_wide > expert_narrow * 1.3, (expert_narrow, expert_wide)
            page.set_viewport_size({'width': 1440, 'height': 1000})
            print('PASS: wide mode applies to document and expert detail pages and persists')

            page.goto(base + '/#/c/journal')
            page.locator('.tl li').first.wait_for()
            page.locator('#side-filter').fill('')
            before_count = page.locator('.month .tl > li').count()
            # 服务端写入故意延迟 1.5s：界面必须先变化，不等网络。
            real_set_archived = module.set_archived
            module.set_archived = lambda *a: (__import__('time').sleep(1.5), real_set_archived(*a))[1]
            row = page.locator('.tl li').filter(has_text='无类型-标题')
            row.hover()
            elapsed = page.evaluate('''n => new Promise(resolve => {
              const start = performance.now()
              const done = () => document.querySelectorAll('.month .tl > li').length < n
              setTimeout(() => resolve(99999), 5000)
              new MutationObserver((_, ob) => { if (done()) { ob.disconnect(); resolve(performance.now() - start) } }).observe(document.querySelector('#main'), { childList: true, subtree: true })
              const btn = [...document.querySelectorAll('.month .tl li')].find(li => li.textContent.includes('无类型-标题')).querySelector('[data-act=archive]')
              btn.click()
            })''', before_count)
            assert elapsed < 200, elapsed
            assert page.locator('.month .tl > li').count() == before_count - 1
            groups = page.locator('#side-list .side-group > h4').all_inner_texts()
            assert any(g.split()[-2:] == ['归档', '1'] or g.replace('\n', ' ').strip().endswith('归档 1') for g in groups), groups
            assert module.load_archive().get('2610/07-无类型-标题.md') is None, 'UI changed before the server wrote'
            page.wait_for_timeout(1900)
            module.set_archived = real_set_archived
            assert module.load_archive().get('2610/07-无类型-标题.md') is True
            print(f'PASS: archive updates the UI optimistically in {elapsed:.0f} ms before the server responds')
            page.route('**/api/archive', lambda route: route.fulfill(status=500, content_type='application/json', body='{"error":"磁盘只读"}'))
            page.locator('details[data-fold] summary').click()
            restore = page.locator('details[data-fold] .tl li').filter(has_text='无类型-标题')
            restore.hover()
            restore.locator('[data-act=archive]').click()
            page.locator('#toast').filter(has_text='已恢复').wait_for()
            assert page.locator('details[data-fold] .tl li').filter(has_text='无类型-标题').count() == 1
            page.unroute('**/api/archive')
            print('PASS: failed archive write rolls back the optimistic change')

            for name, dark_bg in (('媒体查询主题', 'rgb(0, 0, 0)'), ('属性主题', 'rgb(0, 0, 0)'), ('存储主题', 'rgb(0, 0, 0)'), ('仅浅色', 'rgb(250, 250, 250)')):
                page.evaluate("localStorage.setItem('jinji.theme', JSON.stringify('dark'))")
                page.goto(base + '/#/c/journal/doc/' + quote(f'2610/08-{name}.html', safe=''))
                page.reload()
                frame = page.frame_locator('#frame')
                frame.locator('h1').wait_for()
                page.wait_for_timeout(100)
                assert frame.locator('body').evaluate('el => getComputedStyle(el).backgroundColor') == dark_bg, name
                if name != '仅浅色':
                    page.locator('[data-act=theme]').click()
                    page.wait_for_timeout(100)
                    assert frame.locator('body').evaluate('el => getComputedStyle(el).backgroundColor') == 'rgb(255, 255, 255)', name
                    page.locator('[data-act=theme]').click()
                    page.wait_for_timeout(100)
                    assert frame.locator('body').evaluate('el => getComputedStyle(el).backgroundColor') == dark_bg, name
            assert page.frame_locator('#frame').locator('h1').inner_text() == '仅浅色'
            standalone = browser.new_page(color_scheme='light')
            standalone.goto(base + '/raw/' + quote('2610/08-媒体查询主题.html'))
            assert standalone.locator('body').evaluate('el => getComputedStyle(el).backgroundColor') == 'rgb(255, 255, 255)'
            standalone.close()
            page.evaluate("localStorage.removeItem('jinji.theme')")
            print('PASS: embedded HTML follows reader theme (media query, data-theme, stored theme); light-only pages and direct opens unchanged')

            page.goto(base + '/#/c/journal/doc/' + quote(pid, safe=''))
            page.locator('.doc-head [data-act=archive]').click()
            page.locator('#toast').filter(has_text='已归档').wait_for()
            page.wait_for_timeout(300)
            assert module.ARCHIVE_FILE.is_file()
            assert not (module.JOURNAL / '_系统').exists()
            print('PASS: archive UI persists outside journal')

            # 收藏：详情页按钮、快捷键 s、首页「我的收藏」、取消与失败回滚；记录写在 journal 之外。
            page.locator('.doc-head [data-act=favorite]').click()
            page.locator('#toast').filter(has_text='已收藏').wait_for()
            assert page.locator('.doc-head [data-act=favorite]').get_attribute('aria-pressed') == 'true'
            page.wait_for_timeout(300)
            assert pid in module.load_favorites()
            page.goto(base + '/#/c/experts/e/scenario-expert')
            page.locator('.ex-lead').wait_for()
            page.keyboard.press('s')
            page.locator('#toast').filter(has_text='已收藏').wait_for()
            page.goto(base + '/#/c/experts')
            page.locator('.hero').wait_for()
            assert page.locator('.expert.card .fav.on').count() == 1
            assert page.locator('#side-list .row.faved').count() == 1
            page.goto(base + '/#/')
            page.locator('.favs .fav-row').first.wait_for()
            assert page.locator('.favs .fav-row').count() == 2
            assert page.locator('.favs .fav-row').first.inner_text().startswith('场') or '场景专家' in page.locator('.favs .fav-row').first.inner_text()
            page.locator('.favs .fav-row').filter(has_text='产品-评审').locator('.fav-link').click()
            page.locator('.doc-title').wait_for()
            assert '#/c/journal/doc/' in page.url
            page.goto(base + '/#/')
            page.locator('.favs .fav-row').first.wait_for()
            page.route('**/api/favorite', lambda route: route.fulfill(status=500, content_type='application/json', body='{"error":"磁盘只读"}'))
            page.locator('.favs .fav-row').filter(has_text='场景专家').locator('[data-act=favorite]').click()
            page.locator('#toast').filter(has_text='已恢复').wait_for()
            assert page.locator('.favs .fav-row').count() == 2
            page.unroute('**/api/favorite')
            page.locator('.favs .fav-row').filter(has_text='场景专家').locator('[data-act=favorite]').click()
            page.locator('#toast').filter(has_text='已取消收藏').wait_for()
            assert page.locator('.favs .fav-row').count() == 1
            page.wait_for_timeout(300)
            assert str(scenario_skill) not in module.load_favorites()
            page.reload()
            page.locator('.favs .fav-row').first.wait_for()
            assert page.locator('.favs .fav-row').count() == 1
            assert not (module.JOURNAL / '_系统').exists()
            print('PASS: favorites from detail pages and shortcut show on Home, open, roll back and persist outside journal')
            page.goto(base + '/#/c/journal/doc/' + quote(pid, safe=''))
            page.locator('.doc-title').wait_for()

            # Keep the previous bridge browser suite for DSH editor integration.
            page.locator('[data-act=search]').first.click()
            page.locator('#pal-input').fill('artifact-search-token')
            page.locator('.pal-sec').filter(has_text='没找到').wait_for()
            page.locator('#pal-input').fill('会议结论')
            page.locator('.pal-item').filter(has_text='产品-评审').wait_for()
            assert page.locator('.pal-item').count() == 1
            page.locator('#pal-input').fill('global-expert-token')
            page.locator('.pal-item').filter(has_text='全局专家').wait_for()
            page.locator('#pal-input').fill('global-tool')
            page.locator('.pal-item').filter(has_text='global-tool').first.wait_for()
            page.keyboard.press('Enter')
            page.locator('.ex-lead').wait_for()
            assert '#/c/experts/s/global-tool' in page.url
            print('PASS: search deduplicates tagged logs, excludes artifacts and finds other skills')

            # 其他技能 → 标为专家：两次点击才写入，只加 metadata.kind 一行；无法自动改的写法给出错误且不改文件。
            page.keyboard.press('Escape')
            top_skill = module.SKILL_ROOTS[0] / 'top-level-kind/SKILL.md'
            top_before = top_skill.read_text('utf-8')
            page.goto(base + '/#/c/experts')
            tile = page.locator('.skill-tile').filter(has_text='top-level-kind')
            tile.hover()
            mark = tile.locator('[data-act=mark-expert]')
            mark.click()
            assert mark.inner_text() == '确认标为专家？' and page.url.endswith('#/c/experts')
            assert top_skill.read_text('utf-8') == top_before
            mark.click()
            page.locator('.expert.card').nth(2).wait_for()
            assert page.locator('.skill-tile').filter(has_text='top-level-kind').count() == 0
            assert top_skill.read_text('utf-8') == top_before.replace('\n---\n# ', '\nmetadata:\n  kind: 专家\n---\n# ', 1)
            bad_skill = module.SKILL_ROOTS[0] / 'string-metadata/SKILL.md'
            bad_before = bad_skill.read_text('utf-8')
            page.goto(base + '/#/c/experts/s/string-metadata')
            detail_mark = page.locator('.doc-head [data-act=mark-expert]')
            detail_mark.click()
            detail_mark.click()
            page.locator('.toast').filter(has_text='标记失败').wait_for()
            assert detail_mark.inner_text() == '标为专家' and detail_mark.is_enabled()
            assert bad_skill.read_text('utf-8') == bad_before and '#/c/experts/s/string-metadata' in page.url
            print('PASS: other skills can be marked as experts with a two-step confirm; unsupported metadata is left untouched')
            assert errors == [], errors
            offline = browser.new_page()
            offline.route('https://**/*', lambda route: route.abort())
            offline.goto(base + '/#/c/journal/doc/' + quote(pid, safe=''))
            offline.locator('#prose h2').filter(has_text='行动项').wait_for()
            assert offline.locator('.doc-sources li').count() == 5
            print('PASS: Markdown renders without external network (vendored libraries)')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
