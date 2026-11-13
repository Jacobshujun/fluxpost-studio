"""All API/media requests intercepted; isolated loopback worker-disabled build only."""
import base64
import json
import os
import struct
import zlib
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get('FLUXPOST_BROWSER_BASE_URL', 'http://127.0.0.1:45678')
assert urlparse(BASE).hostname in ('localhost', '127.0.0.1') and urlparse(BASE).port != 3001
def png_chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))

pixels = b''.join(b'\0' + b''.join(bytes((30 + x, 70 + y, 150)) for x in range(160)) for y in range(180))
PNG = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('!2I5B', 160, 180, 8, 2, 0, 0, 0)) + png_chunk(b'IDAT', zlib.compress(pixels)) + png_chunk(b'IEND', b'')
ART = Path('test-artifacts/content-editor'); ART.mkdir(parents=True, exist_ok=True)
DROP_FILE = ART / 'drop-fixture.png'; DROP_FILE.write_bytes(PNG)

def case(browser, theme, width):
    context = browser.new_context(viewport={'width': width, 'height': 900})
    context.grant_permissions(['clipboard-read', 'clipboard-write'])
    context.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    page = context.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    items = [dict(id=f's-{i}', sourceId=f's-{i}', ownerUserId='owner', platform='xiaohongshu', title=f'Sample {i}', contentText=f'Body {i}', images=[f'/generated/image-{j}.png' for j in range(15)] if i == 0 else [], mediaUrls=[], metrics={}, raw=None, sourceUrl='https://example.test/source', poolStatus='new', projectId='p', projectName='Project', customTags=[]) for i in range(3)]
    items[2].update(mediaType='video', videoUrl='/media/clip.mp4', videoFrames=[{'id':'frame', 'url':'/generated/frame.png', 'score':90, 'type':'highlight', 'reason':'fixture', 'timestamp':1}])
    state = {'fail_save': False, 'fail_upload': False, 'upload': 0, 'patches': [], 'hold_upload': False, 'pending_upload': None, 'desk_reads': 0, 'summary_reads': 0}
    def handler(route):
        request = route.request; u = urlparse(request.url); path = u.path; params = parse_qs(u.query)
        if path == '/api/content/items/images':
            if state['hold_upload']:
                state['pending_upload'] = route; return
            state['upload'] += 1
            route.fulfill(status=400 if state['fail_upload'] else 200, json={'error': 'Upload failed fixture'} if state['fail_upload'] else {'imageUrl': f"/generated/upload-{state['upload']}.png"})
        elif path == '/api/content/items' and request.method == 'PATCH':
            body = request.post_data_json; state['patches'].append(body)
            if state['fail_save']: route.fulfill(status=500, json={'error': 'Save failed fixture'}); return
            item = next(i for i in items if i['id'] == body['id']); item.update(body['patch']); route.fulfill(json={'item': item})
        elif path == '/api/content-pool/desk':
            state['desk_reads'] += 1
            chosen = [i for i in items if params.get('q', [''])[0] in i['title']]
            route.fulfill(json={'items': chosen[:2] if 'cursor' not in params else chosen[2:], 'memberships': [], 'total': len(chosen), 'hasMore': 'cursor' not in params and len(chosen) > 2, 'nextCursor': 'next' if 'cursor' not in params and len(chosen) > 2 else None})
        elif path == '/api/content-pool/desk/summary':
            state['summary_reads'] += 1
            route.fulfill(json={'projects': [], 'collections': [], 'tags': [], 'libraryCounts': {'all': 3, 'default': 3, 'byCollection': {}}, 'libraryStats': {'total': 3, 'analyzed': 0, 'rewritten': 0}})
        elif path == '/api/workspace/settings':
            route.fulfill(json={'settings': {'simpleRunMediaSettings': {'generateImages': False, 'useComfyUiKlein': False, 'directOriginalReference': False, 'includeSourceVideo': False, 'enableVideoTranscription': False}, 'platformCrawlSettings': {}}})
        elif path == '/api/config': route.fulfill(json={'tikhubConfigured': False, 'openaiConfigured': False})
        elif path == '/api/simple/runs': route.fulfill(json={'runs': []})
        elif path == '/api/activity': route.fulfill(json={'entries': []})
        else: route.fulfill(json={})
    page.route('**/api/**', handler)
    page.route('**/media/**', lambda route: route.fulfill(status=204, body=''))
    page.route('**/generated/**', lambda route: route.fulfill(content_type='image/png', body=PNG))
    page.route('https://example.test/**', lambda route: route.fulfill(content_type='image/png', body=PNG))
    page.goto(BASE + '/content', wait_until='networkidle')
    editor = page.get_by_role('region', name='图文编辑')
    expect(editor).to_be_visible(); expect(editor.locator('article')).to_have_count(15)
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Sample 0')
    editor.get_by_role('button', name='预览配图 1', exact=True).click()
    viewport = page.get_by_label('图片缩放预览')
    image = viewport.locator('img')
    expect(page.get_by_label('图片缩放比例')).to_have_text('100%')
    box = viewport.bounding_box()
    before = image.bounding_box()
    x, y = box['x'] + box['width'] * .65, box['y'] + box['height'] * .6
    page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x - 20, y - 20); page.mouse.up()
    assert image.bounding_box() == before, 'Fitted image must not pan'
    modal_scroll = page.locator('.preview-modal-body').evaluate('el => el.scrollTop')
    page.mouse.move(x, y); page.mouse.wheel(0, -100)
    expect(page.get_by_label('图片缩放比例')).to_have_text('120%')
    assert abs(image.bounding_box()['width'] - 192) < 1, 'Percentage is actual natural-pixel scale'
    assert page.locator('.preview-modal-body').evaluate('el => el.scrollTop') == modal_scroll
    page.get_by_role('button', name='适应窗口', exact=True).click()
    expect(page.get_by_label('图片缩放比例')).to_have_text('100%')
    for _ in range(10):
        if page.get_by_role('button', name='放大图片', exact=True).is_enabled():
            page.get_by_role('button', name='放大图片', exact=True).click()
    expect(page.get_by_label('图片缩放比例')).to_have_text('500%')
    page.mouse.move(x, y); page.mouse.wheel(0, -100)
    expect(page.get_by_label('图片缩放比例')).to_have_text('500%')
    viewport.dblclick(); expect(page.get_by_label('图片缩放比例')).to_have_text('100%')
    page.mouse.wheel(0, 100); expect(page.get_by_label('图片缩放比例')).to_have_text('83.3%')
    page.get_by_role('button', name='适应窗口', exact=True).click()
    page.screenshot(path=str(ART / f'{theme}-{width}-preview.png'))
    page.get_by_role('button', name='放大图片', exact=True).click()
    page.get_by_role('button', name='下一张', exact=True).click()
    expect(page.get_by_label('图片缩放比例')).to_have_text('100%')
    page.keyboard.press('Escape')
    editor.get_by_label('标题', exact=True).fill('Edited title')
    editor.get_by_label('正文', exact=True).fill('Body edited\n' + '中' * 1200)
    editor.get_by_role('button', name='下移配图 1', exact=True).click()
    assert editor.locator('article img').first.get_attribute('src').endswith('image-1.png')
    # Native mouse drag between visible handles/cards (not synthetic dragstart).
    source = editor.get_by_role('button', name='拖动配图 1', exact=True)
    target = editor.get_by_role('button', name='拖动配图 2', exact=True)
    source.scroll_into_view_if_needed(); box = source.bounding_box(); target_box = target.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down(); page.mouse.move(target_box['x'] + target_box['width']/2, target_box['y'] + target_box['height']/2, steps=15); page.mouse.up()
    assert editor.locator('article img').nth(1).get_attribute('src').endswith('image-1.png')
    editor.get_by_label('替换配图 1', exact=True).set_input_files({'name': 'replace.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(editor.locator('article img').first).to_have_attribute('src', '/generated/upload-1.png')
    editor.get_by_label('新增图片', exact=True).set_input_files({'name': 'add.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(editor.locator('article')).to_have_count(16)
    # Clipboard and file drop use real File/DataTransfer objects; no storage API calls.
    page.get_by_label('粘贴或拖入图片').evaluate("el => { const dt = new DataTransfer(); dt.items.add(new File(['fixture'], 'paste.png', {type:'image/png'})); el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:dt, bubbles:true})); }")
    expect(editor.locator('article')).to_have_count(17)
    page.get_by_label('粘贴或拖入图片').evaluate("el => { const dt = new DataTransfer(); dt.items.add(new File(['fixture'], 'drop.png', {type:'image/png'})); el.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true})); }")
    expect(editor.locator('article')).to_have_count(18)
    # Real OS clipboard + keyboard while title/body owns focus (not a dispatched paste).
    png_base64 = base64.b64encode(PNG).decode()
    page.evaluate("""async data => {
      const blob = await (await fetch('data:image/png;base64,' + data)).blob();
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    }""", png_base64)
    for field in ('标题', '正文'):
        count = editor.locator('article').count()
        value = editor.get_by_label(field, exact=True).input_value()
        editor.get_by_label(field, exact=True).focus(); page.keyboard.press('Control+V')
        expect(editor.locator('article')).to_have_count(count + 1)
        expect(editor.get_by_label(field, exact=True)).to_have_value(value)
        editor.get_by_role('button', name=f'删除配图 {count + 1}', exact=True).click()
    # Files dropped over the textarea must be consumed before native text-drop behavior.
    body = editor.get_by_label('正文', exact=True); body.scroll_into_view_if_needed()
    drop_box = body.bounding_box()
    cdp = context.new_cdp_session(page)
    for event_type in ('dragEnter', 'dragOver', 'drop'):
        cdp.send('Input.dispatchDragEvent', {'type':event_type, 'x':drop_box['x'] + 20, 'y':drop_box['y'] + 20,
            'data':{'items':[], 'files':[str(DROP_FILE.resolve())], 'dragOperationsMask':1}})
    cdp.detach()
    expect(editor.locator('article')).to_have_count(19)
    editor.get_by_role('button', name='删除配图 19', exact=True).click()
    # Replacement must not bubble into append; ordinary text paste stays native.
    replacements = state['upload']
    editor.locator('.content-source-replace').first.focus(); page.keyboard.press('Control+V')
    expect(editor.locator('article img').first).to_have_attribute('src', f'/generated/upload-{replacements + 1}.png')
    expect(editor.locator('article')).to_have_count(18)
    assert state['upload'] == replacements + 1
    page.evaluate("navigator.clipboard.writeText(' pasted text')")
    editor.get_by_label('标题', exact=True).focus(); page.keyboard.press('End'); page.keyboard.press('Control+V')
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Edited title pasted text')
    editor.get_by_label('标题', exact=True).fill('Edited title')
    editor.get_by_role('button', name='删除配图 2', exact=True).click(); expect(editor.locator('article')).to_have_count(17)
    assert not state['patches'], 'Uploads and gallery changes must remain staged'
    page.locator('.content-desk-source-card').nth(1).locator('button').first.click()
    dialog = page.get_by_role('dialog', name='未保存修改'); expect(dialog).to_be_visible()
    dialog.get_by_role('button', name='取消', exact=True).click(); expect(editor.get_by_label('标题', exact=True)).to_have_value('Edited title')
    state['fail_save'] = True
    editor.get_by_role('button', name='保存修改', exact=True).click()
    expect(page.get_by_text('Save failed fixture', exact=True)).to_be_visible(); expect(editor.locator('article')).to_have_count(17)
    state['fail_save'] = False
    reads_before_save = (state['desk_reads'], state['summary_reads'])
    editor.get_by_role('button', name='保存修改', exact=True).click()
    expect(editor.get_by_role('button', name='保存修改', exact=True)).to_be_disabled()
    assert (state['desk_reads'], state['summary_reads']) == reads_before_save, 'Text/image saves must not wait for or request list/statistics reloads'
    assert items[0]['title'] == 'Edited title' and len(items[0]['images']) == 17
    assert 'metrics' not in state['patches'][-1]['patch']
    page.reload(wait_until='networkidle'); expect(editor.locator('article')).to_have_count(17)
    editor.scroll_into_view_if_needed(); page.screenshot(path=str(ART / f'{theme}-{width}-gallery.png'))
    editor.get_by_label('标题', exact=True).fill('Discard this')
    editor.get_by_role('button', name='放弃修改', exact=True).click()
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Edited title')
    state['fail_upload'] = True
    editor.get_by_label('新增图片', exact=True).set_input_files({'name': 'bad.png', 'mimeType': 'image/png', 'buffer': PNG})
    expect(page.get_by_text('Upload failed fixture', exact=True)).to_be_visible(); expect(editor.locator('article')).to_have_count(17)
    state['fail_upload'] = False
    editor.get_by_label('标题', exact=True).fill('Before filter')
    page.get_by_label('搜索内容池').fill('Sample 1')
    expect(dialog).to_be_visible(); dialog.get_by_role('button', name='放弃并继续').click()
    expect(page.locator('.content-desk-source-card')).to_have_count(1)
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Sample 1')
    expect(editor.locator('article')).to_have_count(0)
    page.get_by_label('搜索内容池').fill('')
    expect(page.locator('.content-desk-source-card')).to_have_count(2)
    page.get_by_role('button', name='加载更多', exact=True).click(); expect(page.locator('.content-desk-source-card')).to_have_count(3)
    editor.get_by_label('标题', exact=True).fill('Saved on switch')
    page.locator('.content-desk-source-card').nth(0).locator('button').first.click()
    expect(dialog).to_be_visible()
    state['fail_save'] = True
    dialog.get_by_role('button', name='保存并继续').click()
    expect(dialog.get_by_role('button', name='保存并继续')).to_be_enabled()
    expect(dialog).to_be_visible()
    state['fail_save'] = False
    dialog.get_by_role('button', name='保存并继续').click()
    expect(dialog).not_to_be_visible()
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Edited title')
    expect(page.locator('.content-desk-source-card')).to_have_count(3)
    assert items[1]['title'] == 'Saved on switch'
    while editor.locator('article').count():
        editor.get_by_role('button', name='删除配图 1', exact=True).click()
    editor.get_by_role('button', name='保存修改', exact=True).click()
    expect(editor.get_by_role('button', name='保存修改', exact=True)).to_be_disabled()
    page.reload(wait_until='networkidle'); expect(editor.locator('article')).to_have_count(0)
    editor.scroll_into_view_if_needed(); page.screenshot(path=str(ART / f'{theme}-{width}.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'
    # A late upload cannot change the selected source; cancellation preserves the draft.
    state['hold_upload'] = True
    editor.get_by_label('新增图片', exact=True).set_input_files({'name':'held.png', 'mimeType':'image/png', 'buffer':PNG})
    expect(editor.get_by_label('标题', exact=True)).to_be_disabled()
    pending = state['pending_upload']
    editor.evaluate("el => { const dt = new DataTransfer(); dt.items.add(new File(['fixture'], 'busy.png', {type:'image/png'})); el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:dt, bubbles:true})); el.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true})); }")
    assert state['pending_upload'] is pending, 'Busy imports must not issue another upload'
    page.locator('.content-desk-source-card').nth(1).locator('button').first.click()
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Edited title')
    assert state['pending_upload'] is not None
    state['pending_upload'].fulfill(json={'imageUrl':'/generated/held.png'})
    state['hold_upload'] = False
    expect(editor.locator('article')).to_have_count(1)
    editor.get_by_role('button', name='放弃修改', exact=True).click()
    expect(editor.locator('article')).to_have_count(0)
    page.get_by_role('button', name='加载更多', exact=True).click()
    page.locator('.content-desk-source-card').nth(2).locator('button').first.click()
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Sample 2')
    expect(editor.locator('article')).to_have_count(0)
    expect(page.locator('.content-desk-detail video')).to_have_count(1)
    expect(page.locator('.content-desk-detail img[src*="frame.png"]')).to_have_count(2)
    editor.get_by_label('标题', exact=True).fill('Video title edit')
    page.evaluate("() => { history.pushState(null, '', '/content?sourceId=s-0'); dispatchEvent(new PopStateEvent('popstate')); }")
    expect(dialog).to_be_visible(); dialog.get_by_role('button', name='取消', exact=True).click()
    expect(editor.get_by_label('标题', exact=True)).to_have_value('Video title edit')
    editor.get_by_role('button', name='放弃修改', exact=True).click()
    assert not errors, errors
    context.close(); print(f'Content editor {theme} {width}: passed', flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    for theme in ('professional', 'editorial', 'creator'):
        for width in (1440, 390): case(browser, theme, width)
    browser.close()
