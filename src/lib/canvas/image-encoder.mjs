import sharp from "sharp";

// Kept as a traced Node entry point so cancellation kills native libvips work too.
// libvips exposes animated WebP pages, but its PNG loader only exposes APNG's first frame.
function isAnimatedPng(buffer) {
    for (let offset = 8; offset + 12 <= buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        if (offset + length + 12 > buffer.length)
            throw new Error("PNG 数据块不完整。");
        if (buffer.toString("ascii", offset + 4, offset + 8) === "acTL")
            return true;
        offset += length + 12;
    }
    return false;
}
async function encodeCanvasImage(buffer, config, IMAGE_PROCESS_LIMITS) {
    if (!buffer.length || buffer.length > IMAGE_PROCESS_LIMITS.bytes)
        throw new Error("图片为空或超过 30 MB。");
    const options = { limitInputPixels: IMAGE_PROCESS_LIMITS.pixels, failOn: "warning" };
    const metadata = await sharp(buffer, options).metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
        throw new Error("仅支持静态 JPEG、PNG、WebP 图片。");
    if ((metadata.pages ?? 1) > 1 || (metadata.format === "png" && isAnimatedPng(buffer)))
        throw new Error("不支持动画或多页图片。");
    const swapped = (metadata.orientation ?? 1) >= 5;
    const sourceWidth = swapped ? metadata.height : metadata.width;
    const sourceHeight = swapped ? metadata.width : metadata.height;
    let width = sourceWidth, height = sourceHeight;
    if (config.resizeMode === "percent") {
        width = Math.max(1, Math.round(sourceWidth * config.scalePercent / 100));
        height = Math.max(1, Math.round(sourceHeight * config.scalePercent / 100));
    }
    else if (config.resizeMode === "longest") {
        const scale = config.longestEdge / Math.max(sourceWidth, sourceHeight);
        width = Math.max(1, Math.round(sourceWidth * scale));
        height = Math.max(1, Math.round(sourceHeight * scale));
    }
    else if (config.resizeMode === "custom") {
        width = config.width;
        height = config.height;
        if (config.fit === "inside") {
            const scale = Math.min(width / sourceWidth, height / sourceHeight);
            width = Math.max(1, Math.round(sourceWidth * scale));
            height = Math.max(1, Math.round(sourceHeight * scale));
        }
    }
    if (Math.max(width, height) > IMAGE_PROCESS_LIMITS.edge || width * height > IMAGE_PROCESS_LIMITS.pixels)
        throw new Error("输出超过 8192 像素边长或 4000 万像素，请调整分辨率。");
    let pipeline = sharp(buffer, options).autoOrient().toColourspace("srgb");
    if (config.format === "jpeg")
        pipeline = pipeline.flatten({ background: config.background });
    if (config.resizeMode !== "original")
        pipeline = pipeline.resize(width, height, {
            kernel: sharp.kernel.lanczos3,
            fit: config.resizeMode === "custom" && config.fit !== "inside" ? config.fit : "fill",
            position: "centre", background: config.background,
        });
    const encode = (quality) => {
        const clone = pipeline.clone();
        return (config.format === "png" ? clone.png({ compressionLevel: 9, palette: false })
            : config.format === "jpeg" ? clone.jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
                : clone.webp({ quality, effort: 6 })).toBuffer({ resolveWithObject: true });
    };
    const targetBytes = config.compressionMode === "percent" ? Math.floor(buffer.length * config.targetPercent / 100)
        : config.compressionMode === "size" ? config.targetKB * 1024 : undefined;
    let quality = config.quality;
    let encoded = await encode(quality);
    if (targetBytes !== undefined && encoded.data.length > targetBytes) {
        const minimum = config.format === "png" ? encoded : await encode(config.minQuality);
        if (minimum.data.length > targetBytes)
            throw new Error(`目标 ${targetBytes} 字节无法达到；${config.format === "png" ? "PNG 无损压缩后" : `最低画质 ${config.minQuality} 下`}为 ${minimum.data.length} 字节。请提高目标体积或手动调整分辨率。`);
        encoded = minimum;
        quality = config.minQuality;
        let low = config.minQuality + 1, high = config.quality - 1;
        // At most seven further encodes for the integer 1..100 quality domain.
        while (low <= high) {
            const candidateQuality = Math.floor((low + high) / 2);
            const candidate = await encode(candidateQuality);
            if (candidate.data.length <= targetBytes) {
                encoded = candidate;
                quality = candidateQuality;
                low = candidateQuality + 1;
            }
            else
                high = candidateQuality - 1;
        }
    }
    return { buffer: encoded.data, sourceWidth, sourceHeight, width: encoded.info.width, height: encoded.info.height,
        quality: config.format === "png" ? undefined : quality, targetBytes };
}

process.once("message", async ({ buffer, config, limits }) => {
  let message;
  try { message = { result: await encodeCanvasImage(buffer, config, limits) }; }
  catch (error) { message = { error: { name: error.name, message: error.message } }; }
  process.send(message, () => process.exit(message.error ? 1 : 0));
});
process.once("disconnect", () => process.exit(1));
