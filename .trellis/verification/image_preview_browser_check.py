"""Real image geometry/mouse regression, intercepted APIs/media on isolated server."""
import asyncio
import json
import os
import struct
import zlib
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect
from review_performance_browser_check import post, summary
from review_usability_browser_check import fixture as review_fixture

BASE = os.environ.get('BROWSER_BASE_URL', 'http://127.0.0.1:45678')
assert urlparse(BASE).hostname in ('localhost', '127.0.0.1') and urlparse(BASE).port != 3001
ART = Path('test-artifacts/image-preview')
SIZES = [(800, 8000), (8000, 400), (1800, 2400), (2400, 2400), (80, 60)]


def png(width, height):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    # Distinct border/row colors make screenshot clipping immediately visible.
    rows = b''.join(b'\0' + bytes((240, 70, 40)) * width if y < 12 or y >= height - 12 else b'\0' + bytes((40, 170, 180)) * 12 + bytes((30 + y % 180, 80, 140)) * (width - 24) + bytes((240, 200, 40)) * 12 for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


IMAGES = [png(*size) for size in SIZES]


async def setup(browser, route_name, theme, width, height, input_node=False):
    page = await browser.new_page(viewport={'width': width, 'height': height})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    urls = [f'/generated/preview-{i}.png' for i in range(len(SIZES))] + ['/generated/broken.png']
    sample = dict(id='s-0', sourceId='s-0', ownerUserId='owner', platform='xiaohongshu', title='Preview fixture', contentText='Fixture body', images=urls, mediaUrls=[], metrics={}, raw=None, sourceUrl='https://example.test/source', poolStatus='new', projectId='p', projectName='Project', customTags=[])
    review = post(0)
    review.update(imageUrls=urls, imagePrompts=['fixture'] * len(urls))
    now = '2026-11-09T00:00:00.000Z'
    if route_name == 'canvas' and not input_node:
        urls.append(urls[0])
    node = dict(id='preview', type='input.images' if input_node else 'utility.image-preview', version=1, config=dict(urls=urls) if input_node else {}, executionMode='enabled', position=dict(x=40, y=40))
    workflow = dict(id='preview-fixture', name='Preview fixture', revision=1, ownerUserId='owner', ownerDisplayName='Fixture', isTemplate=False, createdAt=now, updatedAt=now,
                    graph=dict(viewport=dict(x=0, y=0, zoom=1), nodes=[node], edges=[]))
    node_run = dict(id='node-run', runId='run', nodeId='preview', nodeType=node['type'], attempt=1, status='completed', inputs={},
                    outputs={'images': dict(kind='images', items=[dict(url=url) for url in urls])}, startedAt=now, finishedAt=now, createdAt=now, updatedAt=now)
    latest = dict(runId='run', workflowRevision=1, runCreatedAt=now, nodeVersion=1, nodeConfig=node['config'], nodeRun=node_run)

    async def handler(route):
        path = urlparse(route.request.url).path
        if route_name == 'canvas' and path == '/api/canvas/workflows/preview-fixture' and route.request.method == 'PATCH':
            payload = route.request.post_data_json
            assert payload['graph']['nodes'] == workflow['graph']['nodes'], ('Preview must not edit Canvas nodes', payload['graph']['nodes'], workflow['graph']['nodes'])
            assert payload['graph']['edges'] == [], 'Preview must not edit Canvas edges'
            workflow.update(payload)
            workflow['revision'] += 1
            await route.fulfill(json=dict(workflow=workflow))
            return
        assert route.request.method == 'GET', f'Unexpected mutation: {path}'
        if path.startswith('/generated/') or path.endswith('/thumbnail'):
            if path.endswith('broken.png'):
                await route.fulfill(status=404, body='fixture missing')
            else:
                index = int(path.split('preview-')[1].split('.')[0]) if 'preview-' in path else 0
                await route.fulfill(content_type='image/png', body=IMAGES[index])
        elif path == '/api/canvas/workflows':
            await route.fulfill(json=dict(workflows=[workflow]))
        elif path == '/api/canvas/workflows/preview-fixture':
            await route.fulfill(json=dict(workflow=workflow))
        elif path == '/api/canvas/runs':
            await route.fulfill(json=dict(runs=[], latestNodeAttempts=[latest], latestSuccessfulNodeRuns=[latest]))
        elif path == '/api/canvas/schedules':
            await route.fulfill(json=dict(schedules=[]))
        elif path == '/api/content-pool/desk':
            await route.fulfill(json=dict(items=[sample], memberships=[], total=1, hasMore=False, nextCursor=None))
        elif path == '/api/content-pool/desk/summary':
            await route.fulfill(json=dict(projects=[], collections=[], tags=[], libraryCounts=dict(all=1, default=1, byCollection={}), libraryStats=dict(total=1, analyzed=0, rewritten=0)))
        elif path == '/api/review/posts/metadata':
            await route.fulfill(json=dict(summary=dict(total=1, ready=1, approved=0, published=0), authors=['Tester'], platforms=['xiaohongshu']))
        elif path == '/api/review/posts':
            await route.fulfill(json=dict(posts=[summary(review)], nextCursor=None))
        elif path.startswith('/api/review/posts/'):
            await route.fulfill(json=dict(post=review))
        elif path == '/api/workspace/settings':
            await route.fulfill(json=dict(settings=dict(simpleRunMediaSettings={}, platformCrawlSettings={})))
        elif path == '/api/config':
            await route.fulfill(json=dict(tikhubConfigured=False, openaiConfigured=False))
        elif path == '/api/simple/runs':
            await route.fulfill(json=dict(runs=[]))
        elif path == '/api/activity':
            await route.fulfill(json=dict(entries=[]))
        else:
            await route.fulfill(json={})

    await page.route('**/api/**', handler)
    await page.route('**/generated/**', handler)
    await page.goto(BASE + '/' + route_name + ('?workflowId=preview-fixture' if route_name == 'canvas' else ''), wait_until='networkidle')
    if route_name == 'canvas':
        await page.locator('.react-flow__controls-fitview').click()
        await expect(page.get_by_role('button', name='在节点中预览图片 1' if input_node else '预览生成图片 1', exact=True)).to_be_in_viewport()
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")

    async def open_preview():
        if route_name == 'content':
            await page.get_by_role('button', name='预览配图 1', exact=True).click()
        elif route_name == 'canvas':
            await page.get_by_role('button', name='在节点中预览图片 1' if input_node else '预览生成图片 1', exact=True).click()
        else:
            await page.get_by_role('button', name='大图预览', exact=True).click()
        await expect(page.get_by_label('图片缩放预览')).to_be_visible()
        if route_name == 'canvas':
            await expect(page.get_by_role('button', name='关闭图片预览')).to_be_focused()

    await open_preview()
    return page, errors, open_preview


async def settled(page):
    await page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')


async def geometry(page):
    return await page.get_by_label('图片缩放预览').evaluate('''el => {
        const image = el.querySelector('img'), s = el.getBoundingClientRect(), i = image.getBoundingClientRect();
        return {stage: {x:s.x,y:s.y,width:s.width,height:s.height}, image:{x:i.x,y:i.y,width:i.width,height:i.height}, natural:[image.naturalWidth,image.naturalHeight]};
    }''')


async def assert_fit(page, size):
    await expect(page.get_by_label('图片缩放预览')).to_have_attribute('data-mode', 'fit')
    await expect(page.get_by_label('图片缩放预览').locator('img')).to_be_visible()
    await settled(page)
    g = await geometry(page)
    s, i = g['stage'], g['image']
    assert g['natural'] == list(size), g
    scale = min(1, s['width']/size[0], s['height']/size[1])
    assert abs(i['width'] - size[0]*scale) < 1 and abs(i['height'] - size[1]*scale) < 1, g
    assert i['x'] >= s['x']-.5 and i['y'] >= s['y']-.5, g
    assert i['x']+i['width'] <= s['x']+s['width']+.5 and i['y']+i['height'] <= s['y']+s['height']+.5, g
    reported = float((await page.get_by_label('图片缩放比例').inner_text()).rstrip('%'))
    assert abs(reported - scale*100) <= .051, (reported, scale)
    next_label = '下一张图片' if await page.locator('.canvas-image-viewer').count() else '下一张'
    for label in ['适应窗口', '原图 100%', next_label]:
        b = await page.get_by_role('button', name=label, exact=True).bounding_box()
        assert b and b['y'] >= 14 and b['y']+b['height'] <= page.viewport_size['height']-13, (label, b)


async def drag_handle(page, direction, dx, dy):
    h = await page.locator(f'[data-resize="{direction}"]').bounding_box()
    x, y = h['x']+h['width']/2, h['y']+h['height']/2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x+dx, y+dy, steps=6)
    await page.mouse.up()
    await settled(page)


async def case(browser, route_name, theme, width, height):
    page, errors, open_preview = await setup(browser, route_name, theme, width, height)
    panel = page.locator('.resizable-preview-panel')
    next_label = '下一张图片' if route_name == 'canvas' else '下一张'
    canvas_transform = await page.locator('.react-flow__viewport').get_attribute('style') if route_name == 'canvas' else None
    for index, size in enumerate(SIZES):
        await assert_fit(page, size)
        if route_name == 'canvas':
            await expect(panel.locator('header small')).to_have_text(f'{size[0]}×{size[1]}')
            await expect(page.get_by_role('link', name='打开原图')).to_have_attribute('href', f'/generated/preview-{index}.png')
        if index == 0:
            await page.screenshot(path=str(ART / f'{route_name}-{theme}-{width}-{height}.png'))
            # At a long image's minimum scale, wheel-down must keep fit mode,
            # otherwise a later window resize would unexpectedly stop adapting.
            stage = await page.get_by_label('图片缩放预览').bounding_box()
            await page.mouse.move(stage['x']+stage['width']/2, stage['y']+stage['height']/2)
            await page.mouse.wheel(0, 100)
            await settled(page)
            await assert_fit(page, size)
        await page.get_by_role('button', name='原图 100%', exact=True).click()
        await expect(page.get_by_label('图片缩放比例')).to_have_text('100%')
        g = await geometry(page)
        assert abs(g['image']['width']-size[0]) < 1 and abs(g['image']['height']-size[1]) < 1, g
        # At original size, pointer anchoring on overflowing axes retains the image point.
        s, image_before = g['stage'], g['image']
        x, y = s['x']+s['width']*.6, s['y']+s['height']*.6
        await page.mouse.move(x, y)
        await page.mouse.wheel(0, -100)
        await expect(page.get_by_label('图片缩放比例')).to_have_text('120%')
        g = await geometry(page)
        for axis, dimension, point in [('x', 'width', x), ('y', 'height', y)]:
            if image_before[dimension] > s[dimension]:
                assert abs((point-image_before[axis])*1.2 - (point-g['image'][axis])) < 1, (g, image_before)
        # Huge captured drags bring each edge into reach without blank overscroll.
        for sign in (1, -1):
            await page.mouse.move(x, y); await page.mouse.down()
            await page.mouse.move(x+sign*12000, y+sign*12000, steps=3); await page.mouse.up()
            await settled(page)
            g = await geometry(page)
            for axis, dimension in [('x', 'width'), ('y', 'height')]:
                if g['image'][dimension] > s[dimension]+1:
                    image_edge = g['image'][axis] + (g['image'][dimension] if sign < 0 else 0)
                    stage_edge = s[axis] + (s[dimension] if sign < 0 else 0)
                    assert abs(image_edge-stage_edge) < 1, g
            assert not await page.get_by_label('图片缩放预览').evaluate("el => el.classList.contains('is-panning')")
            after = g['image']
            await page.mouse.move(x, y)
            assert (await geometry(page))['image'] == after
        await page.get_by_role('button', name='适应窗口', exact=True).click()
        await assert_fit(page, size)
        old_rect = await panel.bounding_box()
        await page.get_by_role('button', name=next_label, exact=True).click()
        assert await panel.bounding_box() == old_rect
    await expect(page.get_by_role('alert').filter(has_text='图片加载失败')).to_be_visible()
    await expect(page.get_by_role('button', name='原图 100%', exact=True)).to_be_disabled()
    if route_name == 'canvas':
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('#canvas-image-viewer-title')).to_have_text('图片 7 / 7')
        await assert_fit(page, SIZES[0])
        await expect(page.get_by_role('button', name='下一张图片')).to_be_disabled()
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('#canvas-image-viewer-title')).to_have_text('图片 7 / 7')
    await page.keyboard.press('Escape'); await open_preview()
    await assert_fit(page, SIZES[0])
    if route_name == 'canvas':
        await expect(page.get_by_role('button', name='上一张图片')).to_be_disabled()
        await page.keyboard.press('ArrowLeft')
        await assert_fit(page, SIZES[0])
        await page.keyboard.press('ArrowRight')
        await assert_fit(page, SIZES[1])
        await page.keyboard.press('ArrowLeft')
        await assert_fit(page, SIZES[0])
        # Canvas shortcuts must not delete/move nodes behind the modal.
        for key in ('Delete', 'Backspace'):
            await page.keyboard.press(key)
            await expect(page.locator('.react-flow__node[data-id="preview"]')).to_have_count(1)
        assert await page.locator('.react-flow__viewport').get_attribute('style') == canvas_transform

    if width >= 640:
        # Shrink each edge first, so all eight directions can move even at max height.
        for direction in ('n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'):
            before = await panel.bounding_box()
            dx = 24 if 'w' in direction else -24 if 'e' in direction else 0
            dy = 18 if 'n' in direction else -18 if 's' in direction else 0
            await drag_handle(page, direction, dx, dy)
            after = await panel.bounding_box()
            assert abs(after['width'] - (before['width']-abs(dx))) < 1, (direction, before, after)
            assert abs(after['height'] - (before['height']-abs(dy))) < 1, (direction, before, after)
            if 'w' in direction: assert abs(after['x']+after['width']-before['x']-before['width']) < 1
            if 'n' in direction: assert abs(after['y']+after['height']-before['y']-before['height']) < 1
            await assert_fit(page, SIZES[0])
            await drag_handle(page, direction, -dx, -dy)
        await page.get_by_role('button', name='原图 100%', exact=True).click()
        await drag_handle(page, 'se', -70, -40)
        await expect(page.get_by_label('图片缩放比例')).to_have_text('100%')
        assert (await geometry(page))['image']['height'] == SIZES[0][1]
        await page.get_by_role('button', name='适应窗口', exact=True).click()
        await drag_handle(page, 'se', -10000, -10000)
        minimum = await panel.bounding_box()
        assert abs(minimum['width']-360) < 1 and abs(minimum['height']-320) < 1, minimum
        await assert_fit(page, SIZES[0])
        await drag_handle(page, 'nw', -10000, -10000)
        await drag_handle(page, 'se', 10000, 10000)
        maximum = await panel.bounding_box()
        assert abs(maximum['x']-14) < 1 and abs(maximum['y']-14) < 1, maximum
        assert abs(maximum['width']-(width-28)) < 1 and abs(maximum['height']-(height-28)) < 1, maximum
        await page.set_viewport_size(dict(width=780, height=520))
        await settled(page)
        resized = await panel.bounding_box()
        assert resized['x']+resized['width'] <= 766 and resized['y']+resized['height'] <= 506, resized
        await assert_fit(page, SIZES[0])
    else:
        assert await page.locator('.preview-resize-handle:visible').count() == 0
    if route_name == 'canvas':
        await page.keyboard.press('Escape')
        await expect(page.get_by_role('button', name='预览生成图片 1', exact=True)).to_be_focused()
        await open_preview()
        await page.mouse.click(2, 2)
        await expect(page.locator('.canvas-image-viewer')).to_have_count(0)
    assert not errors, errors
    await page.close()
    print(json.dumps(dict(route=route_name, theme=theme, width=width, height=height, result='passed')), flush=True)


async def main():
    ART.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='chrome', headless=True)
        try:
            for route_name in ('content', 'review', 'canvas'):
                for theme in ('professional', 'editorial', 'creator'):
                    for width, height in ((1440, 900), (1280, 480), (390, 844)):
                        await case(browser, route_name, theme, width, height)
            await review_compatibility(browser)
            for width in (1440, 390):
                await canvas_input_compatibility(browser, width)
        finally:
            await browser.close()


async def review_compatibility(browser):
    page, _, _, errors, _ = await review_fixture(browser, 1440, 900, 'professional', video_count=1)
    await page.locator('.review-video-tile .review-gallery-preview').click()
    video = page.locator('.review-preview-stage video')
    await expect(video).to_be_visible()
    assert await video.evaluate('el => el.controls')
    await expect(page.get_by_role('button', name='删除视频', exact=True)).to_be_enabled()
    await expect(page.get_by_role('button', name='Prompt 生成', exact=True)).to_have_count(0)
    await page.keyboard.press('Escape')
    # Hold an isolated upload to prove the new image dialog retains the media lock.
    release = asyncio.Event()
    async def upload(route):
        await release.wait()
        await route.fulfill(json=dict(imageUrl='/generated/replaced.png', bytes=100, mimeType='image/png'))
    await page.route('**/api/review/images', upload)
    await page.locator('.review-gallery input[type="file"]').first.set_input_files(dict(name='fixture.png', mimeType='image/png', buffer=IMAGES[4]))
    await expect(page.get_by_role('button', name='拖动配图 1', exact=True)).to_be_disabled()
    await page.get_by_role('button', name='大图预览', exact=True).click()
    dialog = page.get_by_role('dialog')
    await expect(dialog.get_by_role('button', name='删除图片', exact=True)).to_be_disabled()
    await expect(dialog.get_by_role('button', name='Prompt 生成', exact=True)).to_be_disabled()
    release.set()
    await expect(dialog.get_by_role('button', name='删除图片', exact=True)).to_be_enabled()
    await expect(dialog.get_by_role('button', name='Prompt 生成', exact=True)).to_be_enabled()
    await page.keyboard.press('Escape')
    # The actual gallery-thumbnail entry also opens the shared viewer.
    await page.locator('.review-order-item .review-gallery-preview').first.click()
    await expect(page.get_by_label('图片缩放预览')).to_be_visible()
    await dialog.get_by_role('button', name='删除图片', exact=True).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.review-order-item')).to_have_count(3)
    assert not errors, errors
    await page.close()
    print('Review native video, thumbnail entry, upload lock and preview deletion passed.', flush=True)


async def canvas_input_compatibility(browser, width):
    page, errors, _ = await setup(browser, 'canvas', 'professional', width, 900, input_node=True)
    await assert_fit(page, SIZES[0])
    await page.keyboard.press('Escape')
    # Opening the fourth visible thumbnail starts at its original sequence slot.
    await page.get_by_role('button', name='在节点中预览图片 4', exact=True).click()
    await expect(page.locator('#canvas-image-viewer-title')).to_have_text('图片 4 / 6')
    await assert_fit(page, SIZES[3])
    await page.keyboard.press('ArrowRight')
    await assert_fit(page, SIZES[4])
    await page.keyboard.press('ArrowRight')
    await expect(page.get_by_role('alert').filter(has_text='图片加载失败')).to_be_visible()
    await expect(page.get_by_role('button', name='下一张图片')).to_be_disabled()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#canvas-image-viewer-title')).to_have_text('图片 6 / 6')
    await page.keyboard.press('Escape')
    await expect(page.get_by_role('button', name='在节点中预览图片 4', exact=True)).to_be_focused()
    assert not errors, errors
    await page.close()
    print(f'Canvas input images {width}: selected slot, hidden images and end boundary passed.', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
