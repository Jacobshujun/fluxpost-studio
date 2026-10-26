import { NextResponse } from "next/server";
import { requireWorkspaceAccount, isWorkspaceSignInError } from "@/lib/workspace-accounts";
import { generatedImageCoverage, retryGeneratedImages } from "@/lib/generated-image-store";
import { startGeneratedBackfill, kickGeneratedImageWorker } from "@/lib/generated-image-backfill";
import { parseLibrarySelection, patchLibraryAsset, resolveLibrarySelectionIds } from "@/lib/library-assets";
import { generatedCaptureFailures, retryGeneratedCaptureFailures } from "@/lib/generated-image-capture";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireWorkspaceAccount(request);
    await startGeneratedBackfill(actor);
    const coverage = await generatedImageCoverage(actor);
    const captureFailures = generatedCaptureFailures(actor);
    return NextResponse.json({ ...coverage, captureFailed: captureFailures.length, failures: [...captureFailures, ...coverage.failures] });
  } catch (error) { return responseError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireWorkspaceAccount(request);
    const body = await request.json() as { action?: string; vehicle?: unknown; selection?: unknown };
    if (body.action === "retry") { await retryGeneratedCaptureFailures(actor); await retryGeneratedImages(actor); kickGeneratedImageWorker(); }
    else if (body.action === "rescan") await startGeneratedBackfill(actor, true);
    else if (body.action === "vehicle") {
      if (typeof body.vehicle !== "string" || body.vehicle.length > 100) return NextResponse.json({ error: "Invalid vehicle name." }, { status: 400 });
      const ids = await resolveLibrarySelectionIds(actor, parseLibrarySelection(body.selection));
      const failures: Array<{ assetId: string; error: string }> = [];
      for (const id of ids) {
        try { await patchLibraryAsset(actor, id, { manualOverrides: { vehicleModels: body.vehicle.trim() ? [body.vehicle.trim()] : [] } }); }
        catch (error) { failures.push({ assetId: id, error: error instanceof Error ? error.message : String(error) }); }
      }
      return NextResponse.json({ updated: ids.length - failures.length, failures });
    } else return NextResponse.json({ error: "Unknown generated-library action." }, { status: 400 });
    return NextResponse.json(await generatedImageCoverage(actor));
  } catch (error) { return responseError(error); }
}
function responseError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
}
