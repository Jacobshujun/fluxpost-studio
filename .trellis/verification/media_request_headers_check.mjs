import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src/lib/media-request.ts");
const source = readFileSync(sourcePath, "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
});

const cjsModule = { exports: {} };
vm.runInNewContext(
  transpiled.outputText,
  {
    URL,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
  },
  { filename: sourcePath },
);

const { buildMediaRequestHeaders } = cjsModule.exports;
if (typeof buildMediaRequestHeaders !== "function") {
  throw new Error("buildMediaRequestHeaders must be exported from src/lib/media-request.ts");
}

const douyinVideoHeaders = buildMediaRequestHeaders(
  "https://v5-dy-o-abtest.zjcdn.com/abc/video/tos/cn/tos-cn-ve-15c000-ce/sample/?mime_type=video_mp4",
);
if (douyinVideoHeaders.Referer !== "https://www.douyin.com/" || douyinVideoHeaders.Origin !== "https://www.douyin.com") {
  throw new Error("Douyin/ByteDance video CDN requests should use douyin.com Referer and Origin.");
}
if (douyinVideoHeaders.Accept !== "video/mp4,video/*;q=0.9,*/*;q=0.8") {
  throw new Error("Video media requests should use the video Accept header.");
}
if (douyinVideoHeaders["Accept-Encoding"] !== "identity") {
  throw new Error("Video media requests should avoid compressed transfer encoding.");
}

const xhsHeaders = buildMediaRequestHeaders("https://sns-na-i11.xhscdn.com/notes_pre_post/image.webp");
if (xhsHeaders.Referer !== "https://www.xiaohongshu.com/" || xhsHeaders.Origin !== "https://www.xiaohongshu.com") {
  throw new Error("Xiaohongshu media requests should keep Xiaohongshu Referer and Origin.");
}

const genericHeaders = buildMediaRequestHeaders("https://cdn.example.com/assets/image.jpg");
if (genericHeaders.Referer !== "https://cdn.example.com/" || genericHeaders.Origin) {
  throw new Error("Generic media requests should keep the host referer and no synthetic Origin.");
}

console.log("Media request headers check passed.");
