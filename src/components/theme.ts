// The two themes and the paper color of each, shared by the layout (the
// browser bar's first color) and ThemeToggle (the bar's color after a switch).
// The hex values are --background in globals.css.
export type Theme = "light" | "dark";

export const THEME_COLORS: Record<Theme, string> = {
  light: "#f6f4ef",
  dark: "#14130f",
};

// The key the script in layout.tsx reads before the first paint.
export const THEME_KEY = "theme";

// The theme on the page now. The script in layout.tsx sets the attribute
// before anything is painted; without it the page shows the light tokens.
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// Puts a theme on the page, keeps it for the next visit and gives the browser
// bar the same paper color. Both theme-color tags take the color, since the
// one whose media matches the system setting is the one the browser uses.
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  syncThemeColor(theme);
}

// Writes only the tags that differ, so the watcher in ThemeToggle, which
// runs on every change to <head>, doesn't set itself off again.
export function syncThemeColor(theme: Theme) {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (meta.content !== THEME_COLORS[theme]) meta.content = THEME_COLORS[theme];
  }
}
