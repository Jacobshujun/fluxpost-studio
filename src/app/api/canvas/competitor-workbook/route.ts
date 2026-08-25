import { NextResponse } from "next/server";
import { CompetitorWorkbookError, inspectCompetitorWorkbook } from "@/lib/competitor-workbook";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) {
      return NextResponse.json({ error: "Only workspace administrators can inspect local workbooks." }, { status: 403 });
    }
    const body = await request.json() as {
      path?: unknown;
      worksheet?: unknown;
      rowStart?: unknown;
      rowEnd?: unknown;
    };
    const filePath = typeof body.path === "string" ? body.path.trim() : "";
    if (!filePath) return NextResponse.json({ error: "Workbook path is required." }, { status: 400 });
    const inspection = await inspectCompetitorWorkbook({
      filePath,
      worksheet: typeof body.worksheet === "string" ? body.worksheet : undefined,
      rowStart: optionalInteger(body.rowStart),
      rowEnd: optionalInteger(body.rowEnd),
    });
    return NextResponse.json({ workbook: inspection });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof CompetitorWorkbookError ? 400 : 500;
    return NextResponse.json({
      error: status === 500 ? "Workbook inspection failed." : error instanceof Error ? error.message : "Workbook inspection failed.",
    }, { status });
  }
}

function optionalInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new CompetitorWorkbookError("Row bounds must be integers.");
  return parsed;
}
