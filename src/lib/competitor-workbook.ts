import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import readXlsxFile, { readSheetNames, type CellValue, type Row } from "read-excel-file/node";

export const COMPETITOR_WORKBOOK_DEFAULT_SHEET = "文案汇总";
export const COMPETITOR_WORKBOOK_MAX_BYTES = 25 * 1024 * 1024;
export const COMPETITOR_WORKBOOK_MAX_SELECTED_ROWS = 300;

const requiredHeaders = [
  "序号",
  "标题",
  "正文",
  "参数卡片1",
  "参数卡片2",
  "参数卡片3",
  "参数卡片4",
  "参数卡片5",
  "参数卡片6",
] as const;

export type CompetitorWorkbookCardSnapshot = {
  rowKey: string;
  cardIndex: number;
  column: string;
  text: string;
};

export type CompetitorWorkbookRowSnapshot = {
  rowKey: string;
  sourceSequence: string;
  excelRowNumber: number;
  title: string;
  body: string;
  cards: CompetitorWorkbookCardSnapshot[];
};

export type CompetitorWorkbookSnapshot = {
  schemaVersion: 1;
  sourceFileName: string;
  fileSha256: string;
  worksheet: string;
  frozenAt: string;
  rowStart: number;
  rowEnd: number;
  rows: CompetitorWorkbookRowSnapshot[];
};

export type CompetitorWorkbookInspection = {
  sourceFileName: string;
  fileSha256: string;
  worksheets: Array<{ name: string; rowCount: number; columnCount: number }>;
  worksheet: string;
  headers: string[];
  rowCount: number;
  cardCount: number;
  selectedRowCount: number;
  selectedCardCount: number;
  rowStart: number;
  rowEnd: number;
  previewRows: CompetitorWorkbookRowSnapshot[];
};

export class CompetitorWorkbookError extends Error {}

export async function inspectCompetitorWorkbook(input: {
  filePath: string;
  worksheet?: string;
  rowStart?: number;
  rowEnd?: number;
  previewLimit?: number;
}): Promise<CompetitorWorkbookInspection> {
  const parsed = await parseCompetitorWorkbook(input.filePath, input.worksheet);
  const selected = selectCompetitorWorkbookRows(parsed.rows, input.rowStart, input.rowEnd);
  return {
    sourceFileName: parsed.sourceFileName,
    fileSha256: parsed.fileSha256,
    worksheets: parsed.worksheets,
    worksheet: parsed.worksheet,
    headers: [...requiredHeaders],
    rowCount: parsed.rows.length,
    cardCount: parsed.rows.reduce((count, row) => count + row.cards.length, 0),
    selectedRowCount: selected.rows.length,
    selectedCardCount: selected.rows.reduce((count, row) => count + row.cards.length, 0),
    rowStart: selected.rowStart,
    rowEnd: selected.rowEnd,
    previewRows: structuredClone(selected.rows.slice(0, clampInteger(input.previewLimit, 1, 20, 5))),
  };
}

export async function freezeCompetitorWorkbook(input: {
  filePath: string;
  worksheet?: string;
  rowStart?: number;
  rowEnd?: number;
}): Promise<CompetitorWorkbookSnapshot> {
  const parsed = await parseCompetitorWorkbook(input.filePath, input.worksheet);
  const selected = selectCompetitorWorkbookRows(parsed.rows, input.rowStart, input.rowEnd);
  return {
    schemaVersion: 1,
    sourceFileName: parsed.sourceFileName,
    fileSha256: parsed.fileSha256,
    worksheet: parsed.worksheet,
    frozenAt: new Date().toISOString(),
    rowStart: selected.rowStart,
    rowEnd: selected.rowEnd,
    rows: structuredClone(selected.rows),
  };
}

export async function readCompetitorWorkbookSelection(input: {
  filePath: string;
  worksheet?: string;
  rowNumber?: number;
  cardIndex?: number;
}) {
  const snapshot = await freezeCompetitorWorkbook({
    filePath: input.filePath,
    worksheet: input.worksheet,
    rowStart: input.rowNumber,
    rowEnd: input.rowNumber,
  });
  const row = snapshot.rows[0];
  if (!row) throw new CompetitorWorkbookError("The selected workbook row is empty.");
  const cardIndex = clampInteger(input.cardIndex, 1, 6, 1);
  const card = row.cards.find((item) => item.cardIndex === cardIndex);
  if (!card) throw new CompetitorWorkbookError(`Parameter card ${cardIndex} is empty in the selected row.`);
  return { row, card };
}

async function parseCompetitorWorkbook(filePath: string, worksheet?: string) {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath || !path.isAbsolute(normalizedPath)) {
    throw new CompetitorWorkbookError("Workbook path must be an absolute local path.");
  }
  if (path.extname(normalizedPath).toLowerCase() !== ".xlsx") {
    throw new CompetitorWorkbookError("Workbook must be an .xlsx file.");
  }
  let fileStat;
  try {
    fileStat = await stat(normalizedPath);
  } catch {
    throw new CompetitorWorkbookError("Workbook file was not found.");
  }
  if (!fileStat.isFile()) throw new CompetitorWorkbookError("Workbook path must point to a file.");
  if (fileStat.size <= 0) throw new CompetitorWorkbookError("Workbook file is empty.");
  if (fileStat.size > COMPETITOR_WORKBOOK_MAX_BYTES) {
    throw new CompetitorWorkbookError(`Workbook exceeds the ${COMPETITOR_WORKBOOK_MAX_BYTES / 1024 / 1024} MB limit.`);
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(normalizedPath);
  } catch {
    throw new CompetitorWorkbookError("Workbook file could not be read.");
  }
  let sheetNames: string[];
  let workbookSheets: Array<{ name: string; rows: Row[] }>;
  try {
    sheetNames = await readSheetNames(bytes);
    workbookSheets = await Promise.all(sheetNames.map(async (name) => ({ name, rows: await readXlsxFile(bytes, { sheet: name }) })));
  } catch {
    throw new CompetitorWorkbookError("Workbook is not a valid .xlsx file.");
  }
  const worksheetName = String(worksheet || COMPETITOR_WORKBOOK_DEFAULT_SHEET).trim();
  const sheet = workbookSheets.find((candidate) => candidate.name === worksheetName);
  if (!sheet) throw new CompetitorWorkbookError("Selected worksheet was not found.");

  const headerMap = new Map<string, number>();
  (sheet.rows[0] || []).forEach((cell, columnIndex) => {
    const header = cellText(cell);
    if (header && !headerMap.has(header)) headerMap.set(header, columnIndex);
  });
  const missingHeaders = requiredHeaders.filter((header) => !headerMap.has(header));
  if (missingHeaders.length) throw new CompetitorWorkbookError(`Workbook is missing required columns: ${missingHeaders.join(", ")}.`);

  const rows: CompetitorWorkbookRowSnapshot[] = [];
  for (let excelRowNumber = 2; excelRowNumber <= sheet.rows.length; excelRowNumber += 1) {
    const sourceRow = sheet.rows[excelRowNumber - 1] || [];
    const sourceSequence = cellText(sourceRow[headerMap.get("序号")!]);
    const title = cellText(sourceRow[headerMap.get("标题")!]);
    const body = cellText(sourceRow[headerMap.get("正文")!]);
    const rawCards = Array.from({ length: 6 }, (_, index) => cellText(sourceRow[headerMap.get(`参数卡片${index + 1}`)!]));
    if (!sourceSequence && !title && !body && rawCards.every((card) => !card)) continue;
    if (!title || !body) throw new CompetitorWorkbookError(`Workbook row ${excelRowNumber} must contain both title and body.`);
    const rowKey = `${excelRowNumber}:${sourceSequence || rows.length + 1}`;
    const cards = rawCards.flatMap((text, index): CompetitorWorkbookCardSnapshot[] => text ? [{
      rowKey,
      cardIndex: index + 1,
      column: `参数卡片${index + 1}`,
      text,
    }] : []);
    if (!cards.length) throw new CompetitorWorkbookError(`Workbook row ${excelRowNumber} has no parameter cards.`);
    rows.push({ rowKey, sourceSequence, excelRowNumber, title, body, cards });
  }
  if (!rows.length) throw new CompetitorWorkbookError("Selected worksheet has no content rows.");

  return {
    sourceFileName: path.basename(normalizedPath),
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    worksheets: workbookSheets.map((item) => ({ name: item.name, rowCount: Math.max(0, item.rows.length - 1), columnCount: item.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0) })),
    worksheet: sheet.name,
    rows,
  };
}

function selectCompetitorWorkbookRows(rows: CompetitorWorkbookRowSnapshot[], requestedStart?: number, requestedEnd?: number) {
  const minimum = rows[0].excelRowNumber;
  const maximum = rows[rows.length - 1].excelRowNumber;
  const rowStart = requestedStart === undefined ? minimum : integerInRange(requestedStart, minimum, maximum, "rowStart");
  const rowEnd = requestedEnd === undefined ? maximum : integerInRange(requestedEnd, minimum, maximum, "rowEnd");
  if (rowEnd < rowStart) throw new CompetitorWorkbookError("rowEnd must be greater than or equal to rowStart.");
  const selectedRows = rows.filter((row) => row.excelRowNumber >= rowStart && row.excelRowNumber <= rowEnd);
  if (!selectedRows.length) throw new CompetitorWorkbookError("The selected row range contains no content rows.");
  if (selectedRows.length > COMPETITOR_WORKBOOK_MAX_SELECTED_ROWS) {
    throw new CompetitorWorkbookError(`Select at most ${COMPETITOR_WORKBOOK_MAX_SELECTED_ROWS} workbook rows.`);
  }
  return { rows: selectedRows, rowStart, rowEnd };
}

function integerInRange(value: number, minimum: number, maximum: number, name: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new CompetitorWorkbookError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function clampInteger(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function cellText(cell: CellValue | undefined) {
  if (cell === null || cell === undefined) return "";
  return String(cell).replace(/\r\n?/g, "\n").trim();
}
