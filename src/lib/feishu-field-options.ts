import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appConfig } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { resolveFeishuCliInvocation } from "./feishu-cli";

const execFileAsync = promisify(execFile);

type CliResult = {
  stdout: string;
  stderr: string;
};

type FieldDescriptor = {
  name: string;
  type: string;
  raw: Record<string, unknown>;
};

export type FeishuVehicleOptionsResponse = {
  options: string[];
  fieldName: string;
  message?: string;
};

export type FeishuVehicleNormalization = {
  value: string;
  matched: boolean;
  normalizedFrom?: string;
};

export async function listFeishuVehicleOptions(): Promise<FeishuVehicleOptionsResponse> {
  const fieldName = getPublishVehicleFieldName();
  if (!appConfig.feishuCliBin || !appConfig.feishuBitableAppToken || !appConfig.feishuBitableTableId) {
    return {
      options: [],
      fieldName,
      message: "Feishu publish Base is not configured.",
    };
  }

  const result = await runFeishuFieldCli(
    [
      "base",
      "+field-list",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuBitableAppToken,
      "--table-id",
      appConfig.feishuBitableTableId,
      "--jq",
      ".",
      "--limit",
      "200",
    ],
    60_000,
  );
  const fields = extractFieldDescriptors(parseJsonOutput(result.stdout));
  const vehicleField = fields.find((field) => field.name === fieldName);
  if (!vehicleField) {
    return {
      options: [],
      fieldName,
      message: `Feishu publish target Base is missing field: ${fieldName}`,
    };
  }

  return {
    options: extractSingleSelectOptions(vehicleField.raw),
    fieldName,
  };
}

export function normalizeFeishuVehicleValue(value: string | undefined, options: string[]): FeishuVehicleNormalization {
  const trimmed = value?.replace(/\s+/g, " ").trim() || "";
  if (!trimmed) return { value: "", matched: true };

  const exact = options.find((option) => option.trim() === trimmed);
  if (exact) return { value: exact, matched: true };

  const normalizedInput = normalizeVehicleOptionText(trimmed);
  const matches = options.filter((option) => {
    const normalizedOption = normalizeVehicleOptionText(option);
    return normalizedOption === normalizedInput || normalizeMonaAlias(normalizedOption) === normalizedInput;
  });

  if (matches.length === 1) {
    return {
      value: matches[0],
      matched: true,
      normalizedFrom: trimmed,
    };
  }

  return { value: trimmed, matched: false };
}

function normalizeVehicleOptionText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function normalizeMonaAlias(value: string) {
  return value.replace(/mona/g, "");
}

function getPublishVehicleFieldName() {
  const defaults: Record<string, string> = {
    vehicle: "车型",
  };
  if (!appConfig.feishuBitableFieldMap.trim()) return defaults.vehicle;
  try {
    const parsed = JSON.parse(appConfig.feishuBitableFieldMap) as Record<string, unknown>;
    return typeof parsed.vehicle === "string" && parsed.vehicle.trim() ? parsed.vehicle.trim() : defaults.vehicle;
  } catch (error) {
    throw new Error(`FEISHU_BITABLE_FIELD_MAP must be valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

async function runFeishuFieldCli(args: string[], timeout: number): Promise<CliResult> {
  const invocation = resolveFeishuCliInvocation(appConfig.feishuCliBin);
  return runWithConcurrencyPool("feishu", async () => {
    try {
      const result = await execFileAsync(invocation.file, [...invocation.argsPrefix, ...args], {
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        env: buildCliEnv(process.env),
      });
      return {
        stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout || ""),
        stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr || ""),
      };
    } catch (error) {
      throw sanitizeCliError(error);
    }
  });
}

function extractFieldDescriptors(value: unknown): FieldDescriptor[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(extractFieldDescriptors);
  const record = value as Record<string, unknown>;
  const name = firstString(record.field_name, record.fieldName, record.name);
  const type = firstString(record.type, record.field_type, record.fieldType, record.ui_type, record.uiType);
  const current = name ? [{ name, type, raw: record }] : [];
  return [...current, ...Object.values(record).flatMap(extractFieldDescriptors)];
}

function extractSingleSelectOptions(field: Record<string, unknown>) {
  const options = collectOptionNames(field)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function collectOptionNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectOptionNames);

  const record = value as Record<string, unknown>;
  const direct = firstString(record.name, record.text, record.value);
  const fromKnownOptionContainers = ["options", "select_options", "selectOptions", "property", "type_options", "typeOptions"]
    .map((key) => record[key])
    .flatMap(collectOptionNames);

  const looksLikeOption =
    direct &&
    (record.id !== undefined ||
      record.option_id !== undefined ||
      record.optionId !== undefined ||
      record.color !== undefined ||
      record.name !== undefined);

  return looksLikeOption ? [direct, ...fromKnownOptionContainers] : fromKnownOptionContainers;
}

function parseJsonOutput(stdout: string) {
  if (!stdout.trim()) return {};
  return JSON.parse(stdout) as unknown;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() || "";
}

function sanitizeCliError(error: unknown) {
  if (!(error instanceof Error)) return new Error("Feishu field options CLI failed with an unknown error.");
  const next = new Error(sanitizeCliText(error.message));
  const source = error as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  const target = next as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  if (typeof source.stdout === "string") target.stdout = sanitizeCliText(source.stdout);
  if (typeof source.stderr === "string") target.stderr = sanitizeCliText(source.stderr);
  if (source.code !== undefined) target.code = source.code;
  if (source.signal !== undefined) target.signal = source.signal;
  return next;
}

function sanitizeCliText(value: string) {
  let next = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***").replace(/(--base-token\s+)(\S+)/gi, "$1***");
  if (appConfig.feishuBitableAppToken) next = next.replaceAll(appConfig.feishuBitableAppToken, "***");
  return next;
}

function buildCliEnv(env: NodeJS.ProcessEnv) {
  const nextEnv = { ...env };
  const proxy = nextEnv.HTTPS_PROXY || nextEnv.https_proxy || nextEnv.HTTP_PROXY || nextEnv.http_proxy || "";
  if (/^http:\/\/127\.0\.0\.1:9\/?$/i.test(proxy)) {
    nextEnv.LARK_CLI_NO_PROXY = "1";
    nextEnv.HTTPS_PROXY = "";
    nextEnv.HTTP_PROXY = "";
    nextEnv.https_proxy = "";
    nextEnv.http_proxy = "";
  }
  return nextEnv;
}
