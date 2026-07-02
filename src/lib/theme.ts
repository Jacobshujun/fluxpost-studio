export type ThemeMode = "professional" | "editorial" | "creator";

export const themeStorageKey = "fluxpost-theme";
export const themeChangeEvent = "fluxpost-theme-change";
export const themeModes = ["professional", "editorial", "creator"] as const;

export function normalizeTheme(value: string | null): ThemeMode {
  if (value === "light") return "professional";
  if (value === "dark") return "creator";
  return themeModes.includes(value as ThemeMode) ? (value as ThemeMode) : "professional";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "professional";
  return normalizeTheme(window.localStorage.getItem(themeStorageKey));
}

export function subscribeTheme(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(themeChangeEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(themeChangeEvent, listener);
    window.removeEventListener("storage", listener);
  };
}

export function setStoredTheme(nextTheme: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(themeStorageKey, nextTheme);
  document.documentElement.dataset.theme = nextTheme;
  window.dispatchEvent(new Event(themeChangeEvent));
}
