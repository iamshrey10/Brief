"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

export const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System", hint: "Follows your computer" },
] as const;

const noopSubscribe = () => () => {};

/** Light, dark, or whatever the computer is set to, as three choices. The choice is kept in the browser by next-themes. */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  // The saved choice is only known in the browser, so nothing is marked until then.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid gap-2 sm:grid-cols-3">
      {THEME_OPTIONS.map((option) => {
        const selected = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex flex-col items-start rounded-xl border px-4 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            <span className="font-medium">{option.label}</span>
            {"hint" in option && <span className="text-xs text-muted-foreground">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
