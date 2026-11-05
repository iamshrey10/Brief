/**
 * Lets the colors change smoothly for a moment while the theme is switched, then goes back to normal so nothing else is
 * slowed down. A reader who prefers less motion gets the instant change (the style that uses this class turns itself off then).
 */
export function fadeTheme(): void {
  const root = document.documentElement;
  root.classList.add("theme-fade");
  window.setTimeout(() => root.classList.remove("theme-fade"), 300);
}
