import { processCanvasImages } from "./canvas/image-process";
import { IMAGE_PROCESS_LIMITS } from "./canvas/image-process-contract";
import type { ImageProcessConfig } from "./canvas/image-process-contract";

/** Finish generated images before review and publishing; never fall back on failure. */
export async function processSimpleImages(urls: string[], config: ImageProcessConfig | null | undefined, ownerUserId: string): Promise<string[]> {
  if (!config || !urls.length) return urls;
  const outputs: string[] = [];
  for (let index = 0; index < urls.length; index += IMAGE_PROCESS_LIMITS.items) {
    const items = urls.slice(index, index + IMAGE_PROCESS_LIMITS.items).map((url) => ({ url }));
    const processed = await processCanvasImages(items, config, ownerUserId);
    outputs.push(...processed.map((item) => item.url));
  }
  return outputs;
}
