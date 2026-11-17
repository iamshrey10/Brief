"use client";

import { Moon, Sun } from "lucide-react";

import { fadeTheme } from "@/lib/theme-fade";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return <div className="h-9 w-24 max-[400px]:w-11" />;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      // On a narrow phone the words give way to a sun or a moon, so the top bar keeps to one row. The name is still read out.
      className="max-[400px]:min-w-11 max-[400px]:justify-center"
      onClick={() => {
        fadeTheme();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }}
    >
      {resolvedTheme === "dark" ? <Sun aria-hidden="true" className="min-[401px]:hidden" /> : <Moon aria-hidden="true" className="min-[401px]:hidden" />}
      <span className="max-[400px]:sr-only">{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}
