import type { LibraryAssetFilters } from "./types";

export type GeneratedLibraryFilters = Pick<LibraryAssetFilters, "generated" | "generationEntry" | "filename" | "generatedFrom" | "generatedBefore" | "unlabelledVehicle" | "vehicleModels">;
export function normalizeGeneratedLibraryFilters(value: GeneratedLibraryFilters | undefined): GeneratedLibraryFilters {
  return {
    generated: value?.generated === true ? true : undefined, generationEntry: value?.generationEntry?.trim() || undefined,
    filename: value?.filename?.trim().slice(0, 200) || undefined,
    generatedFrom: value?.generatedFrom || undefined, generatedBefore: value?.generatedBefore || undefined,
    unlabelledVehicle: value?.unlabelledVehicle === true ? true : undefined,
    vehicleModels: value?.vehicleModels?.map((item) => item.trim()).filter(Boolean),
  };
}
export function appendGeneratedLibraryFilters(params: URLSearchParams, filters: GeneratedLibraryFilters) {
  for (const [key, value] of Object.entries(normalizeGeneratedLibraryFilters(filters))) {
    if (value === undefined || value === false) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append("vehicleModel", item));
    else params.set(key, String(value));
  }
}
