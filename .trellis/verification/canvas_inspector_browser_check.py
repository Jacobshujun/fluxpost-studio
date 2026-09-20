"""Mocked inspector visibility/layout checks on an isolated worker-disabled server."""
import asyncio
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get('BROWSER_BASE_URL', 'http://127.0.0.1:45678')

async def check(browser, width, theme):
    page = await browser.new_page(viewport={'width': width, 'height': 960})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    workflow = {'id': 'inspector-test', 'name': 'Inspector fixture', 'revision': 1,
                'ownerUserId': 'fixture', 'isTemplate': False,
                'createdAt': '2026-09-20T00:00:00Z', 'updatedAt': '2026-09-20T00:00:00Z',
                'graph': {'nodes': [{'id': key, 'type': 'utility.image-preview', 'version': 1,
                                    'label': label, 'position': {'x': x, 'y': 100}, 'config': {}}
                                   for key, label, x in [('a', 'Alpha', 80), ('b', 'Beta', 420)]],
                          'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 0.6}}}
    errors, violations = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    async def intercept(route):
        nonlocal workflow
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if not parsed.path.startswith('/api/'):
            await route.continue_()
            return
        payload = {}
        if parsed.path == '/api/canvas/workflows':
            payload = {'workflows': [workflow]}
        elif parsed.path == '/api/canvas/workflows/inspector-test':
            if request.method == 'PATCH':
                workflow = {**workflow, **request.post_data_json, 'revision': workflow['revision'] + 1}
            payload = {'workflow': workflow}
        elif parsed.path == '/api/canvas/runs':
            payload = {'runs': [], 'latestNodeAttempts': [], 'latestSuccessfulNodeRuns': []}
        elif parsed.path == '/api/canvas/schedules':
            payload = {'schedules': []}
        elif request.method != 'GET':
            violations.append(f'{request.method} {parsed.path}')
        await route.fulfill(json=payload)

    await page.route('**/*', intercept)
    await page.goto(BASE + '/canvas?workflowId=inspector-test', wait_until='networkidle')
    inspector = page.locator('.canvas-inspector')
    stage = page.get_by_test_id('canvas-stage')
    a = page.locator('.react-flow__node[data-id="a"] .canvas-node-head strong')
    b = page.locator('.react-flow__node[data-id="b"] .canvas-node-head strong')
    await expect(a).to_be_visible()
    await expect(inspector).to_have_count(0)
    for palette in ([False, True] if width > 820 else [False]):
        if palette:
            await page.get_by_role('button', name='显示节点库', exact=True).click()
        closed = (await stage.bounding_box())['width']
        await a.click()
        await expect(inspector).to_be_visible()
        await expect(inspector.locator('input').first).to_have_value('Alpha')
        opened = (await stage.bounding_box())['width']
        if width > 820:
            assert closed - opened >= 279, (closed, opened)
        else:
            assert abs(closed - opened) < 2
        await page.get_by_role('button', name='关闭属性', exact=True).click()
        await expect(inspector).to_have_count(0)
        await page.wait_for_function('(width) => Math.abs(document.querySelector(".canvas-stage").getBoundingClientRect().width - width) < 2', arg=closed)
        await a.click()
        await expect(inspector).to_be_visible()
        if width > 820:
            await page.locator('.canvas-stage .react-flow__controls-fitview').click()
        else:
            await page.get_by_role('button', name='关闭属性', exact=True).click()
        await b.click()
        await expect(inspector.locator('input').first).to_have_value('Beta')
        await inspector.locator('input').first.fill('Beta edited')
        await inspector.locator('input').first.press('Enter')
        await page.locator('.canvas-stage .react-flow__pane').click(position={'x': 20, 'y': 15 if width <= 820 else 500})
        await expect(inspector).to_have_count(0)
        await b.click()
        await expect(inspector.locator('input').first).to_have_value('Beta edited')
        await inspector.locator('input').first.fill('Beta')
        await inspector.locator('input').first.press('Enter')
        await page.get_by_role('button', name='关闭属性', exact=True).click()
        await expect(inspector).to_have_count(0)
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'document overflow'
    await page.screenshot(path=f'test-artifacts/canvas-inspector-{theme}-{width}.png')
    assert not errors, errors
    assert not violations, violations
    print(f'PASS inspector: {theme} {width}', flush=True)
    await page.close()

async def main():
    parsed = urlparse(BASE)
    if parsed.hostname not in ['127.0.0.1', 'localhost', '::1'] or parsed.port in [None, 3001]:
        raise RuntimeError('Use an isolated worker-disabled loopback server, never port 3001')
    Path('test-artifacts').mkdir(exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel='chrome', headless=True)
        try:
            for theme in ['professional', 'editorial', 'creator']:
                for width in [1440, 1000, 390]:
                    await check(browser, width, theme)
        finally:
            await browser.close()

asyncio.run(main())
