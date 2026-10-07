"""Browser regression on generated fixtures only; never load the user's journal or drafts.
Requires the already installed Python playwright package and Chromium.
"""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PARENT = r'''<!doctype html><meta charset="utf-8"><title>Jinji real editor test</title>
<style>iframe{width:1300px;height:700px;border:0}#draft{white-space:pre-wrap;min-height:50px;border:1px solid #aaa}</style>
<button id="open">Open reader</button><button id="close">Close reader</button>
<div id="draft" contenteditable="true" data-composer-input="true" role="textbox"></div><div id="frames"></div><div id="notice"></div>
<script>
const snapshotStore=value=>{const listeners=new Set();return {getSnapshot:()=>value,set:next=>{value=next;for(const l of listeners)l()},subscribe:l=>{listeners.add(l);return()=>listeners.delete(l)}}};
const imports={
 'react':{createElement(){},memo:f=>f},'react-dom':{},'react/jsx-runtime':{},
 '@deepseek-ai/cordis':{Service:class{}},'@deepseek-ai/dsh-client-ui-slots':{},
 '@deepseek-ai/dsh-client-ui-primitives':{},'@deepseek-ai/dsh-client-store':{createSnapshotStore:snapshotStore}
};
window.__ModuleLoader__={load({id,factory}){const out=factory(name=>imports[name]||{});if(id==='dsh-plugin-jinji-reader')window.plugin=out;else window.runtime=out}};
</script><script src="/runtime.js"></script><script src="/plugin.js"></script><script>
let frame, off; const editor=document.querySelector('#draft');
window.model={selected:true,busy:false,calls:0,delay:120,switchDuringMount:false,falseSuccess:false,closedTabs:0};
window.shell=new runtime.__TestSessionInputShell({actx:{},defaultSink(){throw Error('must not send')}});
shell.editor.setRootElement(editor);shell.editor.setEditable(true);shell.setDraft('before  after');
shell.editor.update(()=>{runtime.__testRoot().getFirstChild().getFirstChild().select(7,7)}, {discrete:true});
shell.bindMirror(draft=>window.persisted=draft);
shell.notices.subscribe(()=>document.querySelector('#notice').textContent=shell.notices.getSnapshot()?.text||'');
const scope={};const realInsert=shell.actions.insertText;
shell.actions.insertText=(...args)=>{model.calls++;if(model.falseSuccess)return true;return realInsert(...args)};
const ctx={sessions:{list:{getSnapshot:()=>({byId:{
 background:{id:'other',retainedBy:{gateway:1}},
 chosen:{id:'chosen',cwd:ROOT,retainedBy:{mainView:model.selected?1:0}}
}})},scope:id=>id==='chosen'?scope:undefined},get:()=>({input:{for:()=>shell}}),layout:{selectPanel(id){
 if(id!==null)throw Error('must return to conversation');
 closeReader();shell.editor.setRootElement(null);editor.hidden=true;
 setTimeout(()=>{
   if(model.switchDuringMount)model.selected=false;
   shell.editor.setRootElement(editor);shell.editor.setEditable(true);
   if(model.busy){shell.core.phase='submitting';shell.publish()};
   shell.bindMirror(draft=>window.persisted=draft);
   editor.hidden=false;
 },model.delay);
}}};
window.openReader=(view='panel')=>{
 shell.editor.setRootElement(null);editor.hidden=true;
 frame=document.createElement('iframe');frame.id='reader';
 frame.src=READER+'/?dshOrigin='+encodeURIComponent(location.origin)+'&view='+view;
 const source=frame.contentWindow;
 off=plugin._internals.bindReaderBridge(window,()=>frame?.contentWindow,READER,abs=>plugin._internals.insertCitation(ctx,abs));
 document.querySelector('#frames').append(frame);
};
window.closeReader=()=>{off?.();frame?.remove()};
window.citeDirect=()=>plugin._internals.insertCitation(ctx,ROOT+'/docs/00.txt',{closeReader:()=>model.closedTabs++});
document.querySelector('#open').onclick=()=>openReader();document.querySelector('#close').onclick=closeReader;
</script>'''

# Exercise the shipped Lexical/SessionInputShell, not a boolean-returning fake.
# Export two internal test seams in memory only; the installed DSH bundle is unchanged.
RUNTIME = subprocess.check_output([
    '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness', '-e',
    "process.stdout.write(require('fs').readFileSync('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))"
], env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'}, text=True)
assert 'var SessionInputShell = class' in RUNTIME
RUNTIME = RUNTIME.replace('exports.Config = Config;', 'exports.__TestSessionInputShell = SessionInputShell; exports.__testRoot = nl; exports.Config = Config;')

with tempfile.TemporaryDirectory(prefix='jinji-regression-') as temp:
    root = Path(temp).resolve()
    docs = root / 'docs'
    docs.mkdir()
    for i in range(45):
        (docs / f'{i:02d}.txt').write_text(('Fixture text for citation and scroll testing.\n' * 200), encoding='utf-8')
    config = root / 'config.json'
    config.write_text(json.dumps({'journal': str(root), 'skill_roots': [], 'extra_roots': [], 'archive_file': str(root / 'state/archive.json'), 'categories': [
        {'id': 'focus', 'kind': 'docs', 'name': 'Test docs', 'glyph': '专', 'include': ['docs/*.txt']}
    ]}), encoding='utf-8')
    os.environ.update(JINJI_CONFIG=str(config), JINJI_JOURNAL=str(root), JINJI_PORT='0')
    spec = importlib.util.spec_from_file_location('jinji_test_server', ROOT / 'server/server.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    reader = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
    module.PORT = reader.server_port
    reader_url = f'http://127.0.0.1:{reader.server_port}'
    parent_html = PARENT.replace('ROOT', json.dumps(str(root))).replace('READER', json.dumps(reader_url))

    class ParentHandler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.path == '/runtime.js':
                body = RUNTIME.encode()
                kind = 'text/javascript'
            elif self.path == '/plugin.js':
                body = (ROOT / 'dsh-plugin/lib/client.js').read_bytes()
                kind = 'text/javascript'
            else:
                body = parent_html.encode()
                kind = 'text/html; charset=utf-8'
            self.send_response(200)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    parent = ThreadingHTTPServer(('127.0.0.1', 0), ParentHandler)
    for server in (reader, parent):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 1400, 'height': 950})
            page.route('https://**/*', lambda route: route.abort())
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{parent.server_port}/')
            page.locator('#open').click()
            frame = page.frame_locator('#reader')
            frame.locator('.tile').first.click()
            frame.locator('.card').first.wait_for()
            frame.locator('#scroller').evaluate('(el)=>el.scrollTop=650')
            page.wait_for_function("Boolean(document.querySelector('#reader'))")
            # Wait for the real scroll handler to persist state, without reading private data.
            inner = page.frames[1]
            inner.wait_for_function("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('reader:')))).positions['#/c/focus'].main > 600")
            page.locator('#close').click()
            page.locator('#open').click()
            frame = page.frame_locator('#reader')
            frame.locator('.card').first.wait_for()
            assert frame.locator('#scroller').evaluate('(el)=>el.scrollTop') > 600
            assert '#/c/focus' in page.frames[1].url
            print('PASS: iframe remount restores category and scroll')

            frame.locator('#side-filter').fill('00.txt')
            frame.locator('#side-list .row').first.click()
            frame.locator('.code-view').wait_for()
            frame.locator('#scroller').evaluate('(el)=>el.scrollTop=450')
            page.frames[1].wait_for_function("Object.values(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('reader:')))).positions).some(v=>v.main===450)")
            page.locator('#close').click()
            page.locator('#open').click()
            frame = page.frame_locator('#reader')
            frame.locator('.code-view').wait_for()
            assert frame.locator('#side-filter').input_value() == '00.txt'
            assert frame.locator('#scroller').evaluate('(el)=>el.scrollTop') == 450
            print('PASS: document, scroll and filter restored')

            frame.locator('.doc-head [data-act=cite]').click()
            page.wait_for_function("model.calls===1")
            page.wait_for_function("document.activeElement===document.querySelector('#draft')")
            assert page.locator('#reader').count() == 0, 'reader must close'
            actual = page.locator('#draft').inner_text()
            assert '@docs/00.txt' in actual and 'before' in actual and 'after' in actual, actual
            assert page.evaluate('shell.snapshot.draft') == page.evaluate('persisted')
            assert page.evaluate('shell.snapshot.draft') == page.locator('#draft').text_content()
            assert module._cite_queue == []
            print('PASS: shipped DSH editor remounted, real draft/DOM/mirror verified, focus returned')

            page.locator('#open').click()
            frame = page.frame_locator('#reader')
            frame.locator('.code-view').wait_for()
            assert frame.locator('#scroller').evaluate('(el)=>el.scrollTop') == 450
            page.evaluate('model.selected=false')
            frame.locator('.doc-head [data-act=cite]').click()
            frame.locator('#toast').filter(has_text='请先选择一个对话').wait_for()
            assert page.evaluate('model.calls') == 1
            page.evaluate('model.selected=true;model.busy=true')
            frame.locator('.doc-head [data-act=cite]').click()
            page.locator('#notice').filter(has_text='输入框暂时不可编辑').wait_for()
            assert page.evaluate('model.calls') == 1
            page.evaluate("model.busy=false;shell.core.phase='plain';shell.publish();model.falseSuccess=true")
            false_success = page.evaluate('citeDirect()')
            assert false_success['reason'] == 'not-confirmed'
            assert page.evaluate('model.closedTabs') == 0
            page.evaluate('model.falseSuccess=false;model.switchDuringMount=true')
            changed = page.evaluate('citeDirect()')
            assert changed['reason'] == 'session-changed'
            assert page.evaluate('model.calls') == 2, 'no insertion after session switch'
            page.evaluate('model.switchDuringMount=false;model.selected=true')
            success = page.evaluate('citeDirect()')
            assert success['ok'] and page.evaluate('model.closedTabs') == 1
            print('PASS: busy/absent/switched session and false-positive API handled safely')

            page.evaluate("shell.setDraft('');model.delay=180")
            blank = page.evaluate('citeDirect()')
            assert blank['ok'] and page.locator('#draft').inner_text().strip() == '@docs/00.txt'
            page.evaluate("shell.setDraft('keep selected text');shell.editor.update(()=>runtime.__testRoot().getFirstChild().getFirstChild().select(5,13),{discrete:true})")
            selection = page.evaluate('citeDirect()')
            assert selection['ok']
            assert 'selected' in page.locator('#draft').inner_text(), 'selected draft must not be overwritten'
            print('PASS: initially empty draft and selected text retained with real editor')

            page.locator('#open').click()
            frame = page.frame_locator('#reader')
            frame.locator('.brand').click()
            frame.locator('.tiles').wait_for()
            page.locator('#close').click()
            page.locator('#open').click()
            frame = page.frame_locator('#reader')
            frame.locator('.tiles').wait_for()
            print('PASS: explicit Home choice is remembered')
            assert not errors, errors
            browser.close()
    finally:
        reader.shutdown()
        parent.shutdown()
        reader.server_close()
        parent.server_close()
print('browser regression ok')
