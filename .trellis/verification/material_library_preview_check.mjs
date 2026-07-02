import { readFileSync } from "node:fs";
import path from "node:path";

const read = (filePath) => readFileSync(path.join(process.cwd(), filePath), "utf8");
const has = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const page = read("src/app/page.tsx");
const route = read("src/app/api/materials/preview/route.ts");

has(page, /function MaterialAssetEditor/, "MaterialAssetEditor missing");
has(page, /const canPreview = asset\.kind === "image" && isPreviewableImageAssetPath\(asset\.path\)/, "Material asset image preview should allow local absolute image paths through the shared previewability helper.");
has(page, /function isPreviewableImageAssetPath\(url: string\)[\s\S]*isAbsoluteLocalPath\(url\)/, "Previewability helper should include local absolute paths.");
has(page, /if \(isAbsoluteLocalPath\(url\)\) return `\/api\/materials\/preview\?path=\$\{encodeURIComponent\(url\)\}`/, "Local absolute paths should render through /api/materials/preview.");
has(page, /onPreviewAsset=\{\(asset\) => \{[\s\S]*asset\.kind === "image"[\s\S]*openImageGallery\(\[asset\.path\], 0, asset\.name, asset\.path\)/, "Material asset preview action should open the image gallery with the asset path.");

has(route, /requireWorkspaceAccount\(request\)/, "Material preview API should require a signed-in workspace account.");
has(route, /path\.isAbsolute\(targetPath\)/, "Material preview API should only serve absolute local paths.");
has(route, /sniffBrowserSupportedImageMime/, "Material preview API should sniff supported browser image content.");

console.log("Material library preview check passed.");
