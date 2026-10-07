"""Layout/style-ownership regression using the installed DSH module loader.

Run: python3 dsh-plugin/scripts/style-regression.py
Requires Python Playwright, Chromium and the macOS DSH installation.
No live profile, journal, browser state or installed bundle is modified.
React hooks are stubbed for this layout-only test; the actual plugin components,
CSS, DSH style claiming and cleanup run in Chromium. Editor integration is covered
separately by browser-regression.py.
"""
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
LOADER = subprocess.check_output([
    '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness', '-e',
    "process.stdout.write(require('fs').readFileSync('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/client.js','utf8'))",
], env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'}, text=True)
# Expose the installed loader's real cleanup in memory only; do not copy its logic.
SEAM = 'exports.ClientModuleSystem = ClientModuleSystem;'
assert SEAM in LOADER, 'Installed module loader changed; review test seam'
LOADER = LOADER.replace(SEAM, 'exports.__testRemoveOwnedStyles = removeOwnedStyles; ' + SEAM)
PLUGIN = (ROOT / 'dsh-plugin/lib/client.js').read_text('utf-8')
SHELL = '''<style data-plugin="test-shell">
html,body{margin:0;height:100%;background:#121212}
#layout{display:grid;grid-template-columns:280px minmax(0,1fr);height:100%}
#side{background:#23242a}
#center{display:flex;flex-direction:column;min-width:0;overflow:hidden}
</style><div id="layout"><div id="side"></div><div id="center"></div></div>'''

with sync_playwright() as p:
    browser = p.chromium.launch()
    try:
        page = browser.new_page(viewport={'width': 1440, 'height': 860})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # No real service or external resource is accessed, even if 4417 is live.
        page.route('**/*', lambda route: route.fulfill(
            content_type='text/html', body='<!doctype html><title>Fixture reader</title><p>Fixture</p>'))
        page.set_content(SHELL)
        page.evaluate('window.__ModuleLoader__={load:r=>window.runtime=r.factory(()=>({}))}')
        page.add_script_tag(content=LOADER)
        page.evaluate('''() => {
          window.setInterval=()=>0; window.clearInterval=()=>{};
          window.fetch=()=>new Promise(()=>{});
          window.testReact={
            createElement:(type,props,...children)=>({type,props:props||{},children}),
            Fragment:'fragment',useSyncExternalStore:(_s,get)=>get(),useRef:v=>({current:v===undefined?null:v}),
            useEffect(){},useState:()=>['',()=>{}],useCallback:fn=>fn
          };
          const target={mode:'queue',pendingQueue:[]};
          window.system=new runtime.ClientModuleSystem({
            manifest:{modules:[],entries:[],batches:[]},staticModules:{react:testReact},
            registrationTarget:target,
            bootstrapModule:{id:'@deepseek-ai/dsh-client-modules',exports:runtime}
          });
          window.__ModuleLoader__=target;
          window.renderNode=n=>{
            if(n==null)return null;
            if(typeof n==='string')return document.createTextNode(n);
            if(typeof n.type==='function')return renderNode(n.type(n.props));
            const el=document.createElement(n.type);
            for(const [k,v] of Object.entries(n.props)){
              if(k==='ref')continue;
              if(k==='onClick'){el.addEventListener('click',v);continue}
              if(k.startsWith('on'))continue;
              el.setAttribute(k==='className'?'class':k,v);
            }
            for(const c of n.children){const e=renderNode(c);if(e)el.append(e)}
            return el;
          };
          window.navigation=[];window.closedTabs=0;window.themeListeners=new Set();
          window.themeSnap={active:{colorScheme:'dark'}};
          window.applyPlugin=()=>{
            const disposers=[]; window.seats=new Map();
            const ctx={
              get:name=>name==='theme'?{getTheme:()=>themeSnap}:undefined,
              on:(name,fn)=>{if(name!=='theme/change')return()=>{};themeListeners.add(fn);return()=>themeListeners.delete(fn)},
              layout:{selectPanel:id=>navigation.push(id)},
              locale:{bind:()=>k=>k,register:()=>()=>{}},
              effect:fn=>{const off=fn();if(typeof off==='function')disposers.push(off)},
              slots:{inject:(_k,fn)=>fn(),register:(spec,component)=>{
                seats.set(spec.name,{spec,component});return()=>seats.delete(spec.name)
              }},sidebarRightTabs:{register:()=>()=>{}},inject(){}
            };
            system.materialize('dsh-plugin-jinji-reader').exports.apply(ctx);
            window.disposePlugin=()=>{for(const off of disposers.reverse())off()};
          };
          window.mountReader=(seat='main',phase='online')=>{
            const {spec,component}=seats.get(seat);const face=spec.inject().face;
            face.status.set({phase,url:'http://127.0.0.1:4417'});
            const props={t:k=>k,face,useTabInfo:()=>({tab:{actions:{close(){closedTabs++}}}})};
            document.querySelector('#center').replaceChildren(renderNode(component(props)));
          };
          window.measure=()=>{
            const frame=document.querySelector('iframe');const r=frame.getBoundingClientRect();
            const s=document.querySelector('style[data-jinji-shufang]');
            return {width:r.width,height:r.height,border:getComputedStyle(frame).borderTopWidth,
              owner:s?.getAttribute('data-plugin')??null,
              cssId:s?.getAttribute('data-plugin-css')??null,
              count:document.querySelectorAll('style[data-jinji-shufang]').length};
          };
          window.cycleOtherPlugin=id=>{
            system.register({id,factory:()=>({})});system.materialize(id);
            runtime.__testRemoveOwnedStyles(id);
          };
        }''')
        page.add_script_tag(content=PLUGIN)
        page.evaluate('applyPlugin();mountReader()')

        def assert_layout(width, height):
            state = page.evaluate('measure()')
            # 关闭按钮悬浮，不再占用一整行：iframe 铺满容器。
            assert state['width'] == width and state['height'] == height, state
            assert state['border'] == '0px', state
            assert state['owner'] == 'dsh-plugin-jinji-reader', state
            assert state['cssId'] == 'dsh-plugin-jinji-reader/reader.css', state
            assert state['count'] == 1, state

        # The old code fails here after unrelated plugin cleanup (304 x 154).
        page.evaluate("cycleOtherPlugin('unrelated-first')")
        assert_layout(1160, 860)
        print('PASS: unrelated plugin cleanup preserves full-size main reader')
        for i in range(5):
            page.evaluate('(id)=>cycleOtherPlugin(id)', f'unrelated-{i}')
        assert_layout(1160, 860)
        page.set_viewport_size({'width': 1200, 'height': 720})
        assert_layout(920, 720)
        page.evaluate('mountReader()')
        assert_layout(920, 720)
        print('PASS: repeated plugin churn, viewport resize and panel remount')

        page.evaluate("document.querySelector('#center').style.width='420px';mountReader('sidebar.right.pane.tab')")
        page.evaluate("cycleOtherPlugin('unrelated-sidebar')")
        assert_layout(420, 720)
        print('PASS: sidebar reader retains its container size')

        page.evaluate('disposePlugin()')
        assert page.locator('style[data-jinji-shufang]').count() == 0
        assert page.locator('style[data-plugin="test-shell"]').count() == 1
        page.evaluate('applyPlugin();mountReader()')
        assert_layout(420, 720)
        print('PASS: own unload removes only owned style; reactivation adds one copy')

        for phase in ('online', 'connecting', 'offline'):
            page.evaluate('(phase)=>mountReader("main",phase)', phase)
            page.locator('.jjsf-close').click()
            assert page.evaluate('navigation.at(-1)') is None
            assert page.evaluate('closedTabs') == 0
        page.evaluate('mountReader("sidebar.right.pane.tab")')
        page.locator('.jjsf-close').click()
        assert page.evaluate('closedTabs') == 1
        assert page.evaluate('navigation') == [None, None, None, None]
        button = page.locator('.jjsf-close').bounding_box()
        root = page.locator('.jjsf-root').bounding_box()
        assert abs(button['x'] + button['width'] - root['x'] - root['width']) <= 16 and button['y'] - root['y'] <= 12, (button, root)
        assert button['width'] == 32 and button['height'] == 32, button
        assert page.locator('.jjsf-close').get_attribute('aria-label') == 'close'
        assert page.locator('.jjsf-close svg').count() == 1
        tip_hidden = page.locator('.jjsf-tip').evaluate('el => getComputedStyle(el).opacity')
        page.locator('.jjsf-close').hover()
        page.wait_for_timeout(250)
        assert tip_hidden == '0' and page.locator('.jjsf-tip').evaluate('el => getComputedStyle(el).opacity') == '1'
        print('PASS: floating top-right icon close works online/connecting/offline, shows tooltip, closes only its tab')

        page.evaluate('mountReader()')
        assert 'theme=dark' in page.locator('iframe').get_attribute('src')
        page.evaluate("themeSnap={active:{colorScheme:'light'}};for(const fn of themeListeners)fn(themeSnap)")
        assert page.evaluate("Object.values(seats.get('main').spec.inject().face.scheme.getSnapshot())") == ['light']
        print('PASS: reader iframe starts with the DSH theme and tracks theme/change')

        # Mutation check: removing ownership must reproduce the reported collapse.
        page.evaluate('''() => {
          document.querySelector('style[data-jinji-shufang]').removeAttribute('data-plugin');
          cycleOtherPlugin('mutation-control');
        }''')
        broken = page.evaluate('measure()')
        assert broken['count'] == 0 and broken['width'] == 304 and broken['height'] == 154, broken
        print('PASS: negative control reproduces original 304x154 collapse')
        assert errors == [], errors
        print('style regression ok')
    finally:
        browser.close()
