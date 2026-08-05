import json
import tempfile
from copy import deepcopy
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


NOW = "2026-08-05T00:00:00.000Z"
COPY_NODES = "\u590d\u5236\u8282\u70b9"
PASTE = "\u7c98\u8d34"
EXPORT_WORKFLOW = "\u5bfc\u51fa\u5de5\u4f5c\u6d41"
IMPORT_FILE = "\u5bfc\u5165\u5de5\u4f5c\u6d41\u6587\u4ef6"
CANVAS_NAME = "\u753b\u5e03\u540d\u79f0"


def image_node(node_id, label, x, y):
    return {
        "id": node_id,
        "type": "input.images",
        "version": 1,
        "label": label,
        "position": {"x": x, "y": y},
        "size": {"width": 260, "height": 190},
        "schedulerRole": "scene-input",
        "config": {"urls": ["/media/example.png"], "resourceId": "resource-1", "frozenText": "Frozen portable text"},
    }


def preview_node(node_id, label, x, y):
    return {
        "id": node_id,
        "type": "utility.image-preview",
        "version": 1,
        "label": label,
        "position": {"x": x, "y": y},
        "executionMode": "bypass",
        "config": {},
    }


def workflow(workflow_id, name, graph):
    return {
        "id": workflow_id,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Browser Tester",
        "name": name,
        "revision": 1,
        "graph": graph,
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


GRAPH_A = {
    "nodes": [
        image_node("source-a", "Portable Source", 40, 80),
        preview_node("preview-a", "Portable Preview", 380, 80),
    ],
    "edges": [{
        "id": "edge-a",
        "source": "source-a",
        "sourcePort": "images",
        "target": "preview-a",
        "targetPort": "images",
    }],
    "viewport": {"x": 0, "y": 0, "zoom": 1},
}

GRAPH_B = {
    "nodes": [image_node("source-b", "Existing Scene Input", 60, 80)],
    "edges": [],
    "viewport": {"x": 0, "y": 0, "zoom": 1},
}


def install_clipboard_mock(page):
    page.add_init_script("""
        window.__fluxClipboardMode = "reject";
        window.__fluxDownloads = [];
        const unavailable = () => Promise.reject(new DOMException("Clipboard denied", "NotAllowedError"));
        const clipboard = {
          writeText: unavailable,
          read: () => window.__fluxClipboardMode === "external" ? Promise.resolve([]) : unavailable(),
          readText: () => window.__fluxClipboardMode === "external"
            ? Promise.resolve("ordinary external clipboard text")
            : unavailable(),
        };
        Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => clipboard });
        const nativeAnchorClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
          if (this.download && this.href.startsWith("blob:")) {
            const entry = { filename: this.download, text: null };
            window.__fluxDownloads.push(entry);
            fetch(this.href).then((response) => response.text()).then((text) => { entry.text = text; });
          }
          return nativeAnchorClick.call(this);
        };
    """)


def install_mock_api(page):
    workflows = [
        workflow("workflow-a", "Workflow A", deepcopy(GRAPH_A)),
        workflow("workflow-b", "Workflow B", deepcopy(GRAPH_B)),
    ]
    state = {"workflows": workflows, "posts": [], "patches": []}

    def handler(route):
        request = route.request
        path = urlparse(request.url).path

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows" and request.method == "GET":
            fulfill({"workflows": state["workflows"]})
            return
        if path == "/api/canvas/workflows" and request.method == "POST":
            body = request.post_data_json
            state["posts"].append(deepcopy(body))
            imported = workflow("workflow-imported", body["name"], deepcopy(body["graph"]))
            state["workflows"].insert(0, imported)
            fulfill({"workflow": imported}, status=201)
            return
        if path.startswith("/api/canvas/workflows/") and request.method == "PATCH":
            workflow_id = path.rsplit("/", 1)[-1]
            body = request.post_data_json
            state["patches"].append({"id": workflow_id, "body": deepcopy(body)})
            current = next(item for item in state["workflows"] if item["id"] == workflow_id)
            current.update({
                "name": body.get("name", current["name"]),
                "graph": deepcopy(body.get("graph", current["graph"])),
                "revision": current["revision"] + 1,
                "updatedAt": NOW,
            })
            fulfill({"workflow": current})
            return
        if path == "/api/canvas/runs":
            fulfill({"runs": [], "latestSuccessfulNodeRuns": []})
            return
        fulfill({})

    page.route("**/api/**", handler)
    return state


def assert_no_overflow(page, label):
    sizes = page.evaluate("""() => {
      const toolbar = document.querySelector('.canvas-toolbar');
      return {
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        toolbarScrollWidth: toolbar?.scrollWidth || 0,
        toolbarClientWidth: toolbar?.clientWidth || 0,
      };
    }""")
    assert sizes["documentScrollWidth"] <= sizes["viewportWidth"], f"{label} document overflow: {sizes}"
    assert sizes["toolbarScrollWidth"] <= sizes["toolbarClientWidth"], f"{label} toolbar overflow: {sizes}"


def wait_for_canvas(page):
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()


def select_portable_nodes(page):
    source = page.locator('.react-flow__node[data-id="source-a"]')
    preview = page.locator('.react-flow__node[data-id="preview-a"]')
    source.wait_for()
    preview.wait_for()
    source.click(position={"x": 80, "y": 20})
    preview.click(position={"x": 80, "y": 20}, modifiers=["Control"])
    expect(page.locator(".react-flow__node.selected")).to_have_count(2)


def exported_graph_assertions(exported):
    assert set(exported) == {"kind", "version", "name", "graph"}
    assert exported["kind"] == "fluxpost.canvas.workflow"
    assert exported["version"] == 1
    assert exported["name"] == "Edited Before Autosave"
    assert not ({"id", "ownerUserId", "revision", "isTemplate", "createdAt", "updatedAt"} & set(exported))

    graph = exported["graph"]
    assert len(graph["nodes"]) == 3
    assert len(graph["edges"]) == 1
    by_label = {node.get("label"): node for node in graph["nodes"]}
    source = by_label["Portable Source"]
    preview = by_label["Portable Preview"]
    assert source["id"] != "source-a" and preview["id"] != "preview-a"
    assert abs((source["position"]["x"] - preview["position"]["x"]) + 340) < 0.01
    assert abs(source["position"]["y"] - preview["position"]["y"]) < 0.01
    assert source["size"] == {"width": 260, "height": 190}
    assert preview["executionMode"] == "bypass"
    assert source["config"]["frozenText"] == "Frozen portable text"
    assert source["config"]["resourceId"] == "resource-1"
    assert source["config"]["urls"] == ["/media/example.png"]
    assert source.get("schedulerRole") is None
    assert sum(node.get("schedulerRole") == "scene-input" for node in graph["nodes"]) == 1
    edge = graph["edges"][0]
    assert edge["source"] == source["id"] and edge["target"] == preview["id"]
    assert edge["sourcePort"] == "images" and edge["targetPort"] == "images"


def verify_portability(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 960}, accept_downloads=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_clipboard_mock(page)
    state = install_mock_api(page)
    wait_for_canvas(page)

    select_portable_nodes(page)
    page.get_by_role("button", name=COPY_NODES).click()
    expect(page.locator(".canvas-message")).to_contain_text("2")

    page.locator(".canvas-workflow-select").select_option("workflow-b")
    expect(page.locator('.react-flow__node[data-id="source-b"]')).to_be_visible()
    page.get_by_role("button", name=PASTE, exact=True).click()
    expect(page.locator(".canvas-message")).to_contain_text("\u5df2\u7c98\u8d34 2 \u4e2a\u8282\u70b9")
    expect(page.locator(".canvas-message")).to_contain_text("\u573a\u666f\u7d20\u6750")

    page.evaluate("window.__fluxClipboardMode = 'external'")
    page.get_by_role("button", name=PASTE, exact=True).click()
    expect(page.locator(".canvas-message")).to_contain_text("\u6ca1\u6709\u53ef\u5bfc\u5165")

    export_button = page.get_by_role("button", name=EXPORT_WORKFLOW)
    page.wait_for_timeout(1100)
    expect(export_button).to_be_enabled()
    patches_before_export = len(state["patches"])
    page.get_by_label(CANVAS_NAME).fill("Edited Before Autosave")
    expect(export_button).to_be_enabled()
    export_button.click()
    expect(page.locator(".canvas-message")).to_contain_text("\u5df2\u5bfc\u51fa\u5de5\u4f5c\u6d41")
    page.wait_for_function("window.__fluxDownloads.length === 1 && window.__fluxDownloads[0].text !== null")
    captured_download = page.evaluate("window.__fluxDownloads[0]")
    assert captured_download["filename"] == "Edited Before Autosave.fluxpost-workflow.json"
    exported_bytes = captured_download["text"].encode("utf-8")
    exported = json.loads(captured_download["text"])
    exported_graph_assertions(exported)
    assert len(state["patches"]) == patches_before_export, "export must not wait for or require the name autosave"

    file_input = page.get_by_label(IMPORT_FILE)
    file_input.set_input_files({
        "name": captured_download["filename"],
        "mimeType": "application/json",
        "buffer": exported_bytes,
    })
    expect(page.locator(".canvas-workflow-select")).to_have_value("workflow-imported")
    expect(page.get_by_label(CANVAS_NAME)).to_have_value("Edited Before Autosave")
    assert len(state["posts"]) == 1
    assert set(state["posts"][0]) == {"name", "graph"}
    upgraded_graph = deepcopy(exported["graph"])
    for graph_node in upgraded_graph["nodes"]:
        graph_node.setdefault("executionMode", "enabled")
    expected_post = {"name": exported["name"], "graph": upgraded_graph}
    assert state["posts"][0] == expected_post, json.dumps({"actual": state["posts"][0], "expected": expected_post}, ensure_ascii=False)

    invalid = deepcopy(exported)
    invalid["version"] = 99
    file_input.set_input_files({
        "name": "invalid.fluxpost-workflow.json",
        "mimeType": "application/json",
        "buffer": json.dumps(invalid).encode("utf-8"),
    })
    expect(page.locator(".canvas-message")).to_contain_text("FluxPost Canvas workflow files must use version 1")
    assert len(state["posts"]) == 1, "invalid files must not create workflows"

    assert_no_overflow(page, "1440x960")
    page.set_viewport_size({"width": 1024, "height": 768})
    expect(page.get_by_test_id("canvas-stage")).to_be_visible()
    assert_no_overflow(page, "1024x768")
    assert not errors, f"browser page errors: {errors}"
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        verify_portability(browser)
        browser.close()
    print(json.dumps({"status": "passed", "screenshots": str(Path(tempfile.gettempdir()))}))


if __name__ == "__main__":
    main()
