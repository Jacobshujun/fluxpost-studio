import sharp from "sharp";
import { runWithConcurrencyPool } from "./concurrency";
import { labDistanceSquared, libraryColorVersion, rgbToLab } from "./library-color";
import type { LibraryPalette } from "./types";

type Sample = { rgb: number[]; weight: number };

export async function extractLibraryPalette(bytes: Buffer, sha256: string): Promise<LibraryPalette> {
  return runWithConcurrencyPool("libraryColor", async () => {
    const { data, info } = await sharp(bytes, { page: 0, pages: 1, failOn: "error", limitInputPixels: 80_000_000 })
      .rotate().resize(128, 128, { fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb").ensureAlpha().raw().timeout({ seconds: 20 }).toBuffer({ resolveWithObject: true });
    const bins = new Map<number, Sample>();
    let total = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const weight = data[i + 3] / 255;
      if (!weight) continue;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const key = (rgb[0] >> 3) * 1024 + (rgb[1] >> 3) * 32 + (rgb[2] >> 3);
      const existing = bins.get(key);
      if (existing) {
        existing.rgb = rgb.map((v, c) => (existing.rgb[c] * existing.weight + v * weight) / (existing.weight + weight));
        existing.weight += weight;
      } else bins.set(key, { rgb, weight });
      total += weight;
    }
    const boxes: Sample[][] = total ? [[...bins.values()]] : [];
    const range = (box: Sample[], c: number) => Math.max(...box.map((p) => p.rgb[c])) - Math.min(...box.map((p) => p.rgb[c]));
    while (boxes.length < 12) {
      const candidates = boxes.map((box, index) => ({ box, index, score: Math.max(...[0, 1, 2].map((c) => range(box, c))) * box.reduce((s, p) => s + p.weight, 0) }))
        .filter(({ box }) => box.length > 1).sort((a, b) => b.score - a.score || a.index - b.index);
      if (!candidates.length) break;
      const { box, index } = candidates[0];
      const channel = [0, 1, 2].sort((a, b) => range(box, b) - range(box, a) || a - b)[0];
      box.sort((a, b) => a.rgb[channel] - b.rgb[channel] || a.rgb[0] - b.rgb[0] || a.rgb[1] - b.rgb[1] || a.rgb[2] - b.rgb[2]);
      const half = box.reduce((s, p) => s + p.weight, 0) / 2;
      let weight = 0; let split = 0;
      do { weight += box[split++].weight; } while (weight < half && split < box.length - 1);
      split = Math.min(box.length - 1, split);
      boxes.splice(index, 1, box.slice(0, split), box.slice(split));
    }
    const clusters = boxes.map((box) => {
      const weight = box.reduce((s, p) => s + p.weight, 0);
      return { weight, rgb: [0, 1, 2].map((c) => box.reduce((s, p) => s + p.rgb[c] * p.weight, 0) / weight) };
    });
    for (;;) {
      let pair: [number, number] | undefined; let distance = 100;
      for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
        const d = labDistanceSquared(rgbToLab(clusters[i].rgb), rgbToLab(clusters[j].rgb));
        if (d < distance) { distance = d; pair = [i, j]; }
      }
      if (!pair) break;
      const [i, j] = pair; const a = clusters[i]; const b = clusters[j];
      a.rgb = a.rgb.map((v, c) => (v * a.weight + b.rgb[c] * b.weight) / (a.weight + b.weight));
      a.weight += b.weight; clusters.splice(j, 1);
    }
    const colors = clusters.map(({ rgb, weight }) => ({ hex: `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase(), coverage: weight / total }))
      .sort((a, b) => b.coverage - a.coverage || a.hex.localeCompare(b.hex)).slice(0, 6);
    return { status: "completed", sha256, version: libraryColorVersion, colors, analyzedAt: new Date().toISOString() };
  });
}
