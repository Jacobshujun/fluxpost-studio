import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const windowsFonts = [
  { family: "Noto Sans SC", files: ["NotoSansSC-VF.ttf"] },
  { family: "Noto Serif SC", files: ["NotoSerifSC-VF.ttf"] },
  { family: "Microsoft YaHei", files: ["msyh.ttc", "msyh.ttf"] },
  { family: "SimHei", files: ["simhei.ttf"] },
  { family: "DengXian", files: ["Deng.ttf"] },
] as const;

let fontCache: { expiresAt: number; values: string[] } | undefined;

export async function listCanvasSubtitleFonts() {
  if (fontCache && fontCache.expiresAt > Date.now()) return fontCache.values;
  const values = process.platform === "win32" ? await listWindowsSubtitleFonts() : await listFontconfigSubtitleFonts();
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN"));
  fontCache = { expiresAt: Date.now() + 60_000, values: unique };
  return unique;
}

export async function requireCanvasSubtitleFont(fontFamily: string) {
  const fonts = await listCanvasSubtitleFonts();
  const found = fonts.find((font) => font.localeCompare(fontFamily, "zh-CN", { sensitivity: "accent" }) === 0);
  if (!found) throw new Error(`Subtitle font is not installed on this server: ${fontFamily}`);
  return found;
}

async function listWindowsSubtitleFonts() {
  const directory = process.env.WINDIR ? path.join(process.env.WINDIR, "Fonts") : "C:\\Windows\\Fonts";
  const known = windowsFonts.filter((font) => font.files.some((file) => existsSync(path.join(directory, file)))).map((font) => font.family);
  const registered = await runCommand("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"]).catch(() => "");
  const registeredNames = registered.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s{2,}(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (!match) return [];
    const file = match[2].trim();
    const fontPath = path.isAbsolute(file) ? file : path.join(directory, file);
    if (!existsSync(fontPath)) return [];
    const name = match[1].replace(/\s*\((?:TrueType|OpenType)\)\s*$/i, "").split(" & ")[0].trim();
    return name ? [name] : [];
  });
  const registeredSet = new Set(registeredNames.map((name) => name.toLocaleLowerCase("en-US")));
  const families = registeredNames.map((name) => {
    const base = name.replace(/\s+(?:Bold Italic|Bold|Italic|SemiBold|Semi Bold|Light|Medium|Regular|Thin)$/i, "").trim();
    return base !== name && registeredSet.has(base.toLocaleLowerCase("en-US")) ? base : name;
  });
  return [...known, ...families];
}

function listFontconfigSubtitleFonts() {
  return new Promise<string[]>((resolve, reject) => {
    execFile("fc-list", [":", "family"], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`fontconfig is unavailable: ${(stderr || error.message).toString().trim().slice(0, 240)}`));
        return;
      }
      resolve(stdout.split(/\r?\n/).flatMap((line) => line.split(",")).map((value) => value.trim()).filter(Boolean));
    });
  });
}

function runCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).toString().trim()));
      else resolve(stdout);
    });
  });
}
