import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-canvas-draft-persistence-"));
const workflowsUrl = pathToFileURL(path.join(root, "src/lib/canvas/workflows.ts")).href;
const tsxLoader = createRequire(import.meta.url).resolve("tsx");
const childSource = `
  import assert from "node:assert/strict";
  import { createCanvasWorkflow, deleteCanvasWorkflow, getCanvasWorkflow, updateCanvasWorkflow } from ${JSON.stringify(workflowsUrl)};

  const account = { id: "canvas-draft-fixture-owner", username: "fixture", displayName: "Fixture", role: "operator", status: "active", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), passwordSet: true };
  const graph = {
    nodes: [
      { id: "draft-text", type: "input.text", version: 1, position: { x: 10, y: 20 }, config: { text: "" } },
      { id: "draft-model", type: "model.gpt-text", version: 1, position: { x: 240, y: 20 }, config: { instruction: "" } },
    ],
    edges: [],
    viewport: { x: 4, y: 8, zoom: 0.8 },
  };

  const created = await createCanvasWorkflow(account, { name: "Draft persistence fixture", graph });
  try {
    assert.equal(created.revision, 1);
    assert.equal(created.graph.nodes.length, 2);
    const nextGraph = structuredClone(created.graph);
    nextGraph.nodes[0].label = "Unfinished text";
    const updated = await updateCanvasWorkflow(created.id, account, { revision: created.revision, graph: nextGraph });
    const reloaded = await getCanvasWorkflow(created.id, account);
    assert.equal(updated.revision, 2);
    assert.equal(reloaded?.revision, 2);
    assert.equal(reloaded?.graph.nodes[0].label, "Unfinished text");
    assert.equal(reloaded?.graph.nodes[0].config.text, "");
    const malformedGraph = structuredClone(graph);
    malformedGraph.nodes[0].config.text = { nested: true };
    await assert.rejects(
      () => updateCanvasWorkflow(created.id, account, { revision: updated.revision, graph: malformedGraph }),
      /invalid config/i,
    );
  } finally {
    await deleteCanvasWorkflow(created.id, account);
  }
`;

try {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(tsxLoader).href, "--input-type=module", "-e", childSource], {
    cwd: temp,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log("Canvas workflow draft persistence checks passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
