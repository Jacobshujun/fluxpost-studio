import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const files = {
  route: read("src/app/api/config/route.ts"),
  config: read("src/lib/config.ts"),
  types: read("src/lib/types.ts"),
  page: read("src/app/config/page.tsx"),
  home: read("src/app/page.tsx"),
};

assertContains(files.types, /export type AdvancedConfigSnapshot = \{[\s\S]*groups:\s*AdvancedConfigGroup\[\]/, "Advanced config snapshot type is missing.");
assertContains(files.types, /export type AdvancedConfigPatch = \{[\s\S]*values:\s*Record<string,\s*AdvancedConfigPatchValue>/, "Advanced config patch type is missing.");

assertContains(files.route, /url\.searchParams\.get\("advanced"\)\s*!==\s*"1"[\s\S]*getConfigStatus\(\)/, "Plain /api/config must keep returning non-sensitive status.");
assertContains(files.route, /requireWorkspaceAccount\(request\)/, "Advanced config route must require workspace sign-in.");
assertContains(files.route, /!isWorkspaceAdmin\(account\)/, "Advanced config route must require admin role.");
assertContains(files.route, /export async function PATCH/, "Advanced config route must expose a write path.");
assertContains(files.route, /saveAdvancedConfigPatch\(body\)/, "Advanced config PATCH must delegate env writes to config helper.");

assertContains(files.config, /value:\s*field\.kind === "secret" \? undefined : field\.read\(\) \?\? ""/, "Advanced config snapshot must not return secret values.");
assertContains(files.config, /const advancedConfigByKey = new Map/, "Advanced config writes must be allow-listed by known keys.");
assertContains(files.config, /if \(!definition\) throw new Error\(`Unsupported config key:/, "Unknown config keys must be rejected.");
assertContains(files.config, /path\.join\(process\.cwd\(\),\s*"\.env\.local"\)/, "Advanced config must target .env.local through the helper.");
assertContains(files.config, /writeFileSync\(envPath,/, "Advanced config must write environment changes through the helper.");
assertContains(files.config, /delete process\.env\[key\]/, "Clearing a config value must remove it from the current process env.");
assertContains(files.config, /reloadAppConfig\(\)/, "Saving advanced config must refresh the in-process app config.");

assertContains(files.page, /sessionData\.account\.role !== "admin"/, "Advanced config page must block non-admin users.");
assertContains(files.page, /field\.kind === "secret" \? "" : field\.value \|\| ""/, "Advanced config page must not initialize secret inputs with secret values.");
assertContains(files.page, /清空该项/, "Advanced config page must provide an explicit clear action for hidden secrets.");
assertContains(files.page, /\/api\/config\?advanced=1/, "Advanced config page must use the admin-only config snapshot endpoint.");
assertContains(files.home, /currentAccount\.role === "admin"[\s\S]*href="\/config"/, "Home navigation must show advanced config only to admins.");

assertNotContains(files.page, /dangerouslySetInnerHTML/, "Advanced config page must not render config values through raw HTML.");
assertNotContains(files.route, /process\.env\[[^\]]+\][\s\S]*NextResponse\.json/, "Config route must not directly return arbitrary process.env values.");

console.log("Advanced config admin boundary check passed.");

function read(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(filePath, "utf8");
}

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}
