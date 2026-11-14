"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { readChoice, startAnalytics, stopAnalytics, subscribeToChoice, writeChoice, type AnalyticsChoice } from "@/lib/analytics";

const serverChoice = (): AnalyticsChoice => "declined";

function useChoice(): AnalyticsChoice {
  return useSyncExternalStore(subscribeToChoice, readChoice, serverChoice);
}

/**
 * Asks once, at the bottom of the first page, whether visits may be counted. Counting runs only while this page is open and only after
 * a yes, so it never reaches the signed in pages. Without a measurement id it shows nothing at all.
 */
export function AnalyticsNotice({ id }: { id: string | null }) {
  const choice = useChoice();

  useEffect(() => {
    if (!id || choice !== "accepted") return;
    startAnalytics(id);
    return () => stopAnalytics(id);
  }, [id, choice]);

  if (!id || choice !== null) return null;

  return (
    <section
      aria-label="Counting visits"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-lg sm:flex-row sm:items-center sm:gap-5"
    >
      <p className="flex-1 text-muted-foreground">
        May Brief count visits to this first page? It shows roughly where people come from and on what device, nothing more, and it never runs
        inside the app where your documents are.{" "}
        <Link href="/privacy#cookies" className="text-foreground underline underline-offset-4">
          Details
        </Link>
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => writeChoice("declined")}>
          No thanks
        </Button>
        <Button onClick={() => writeChoice("accepted")}>Yes, count it</Button>
      </div>
    </section>
  );
}

/** On the privacy page: shows what was chosen in this browser and lets it be changed at any time. */
export function AnalyticsChoiceControl({ id }: { id: string | null }) {
  const choice = useChoice();
  if (!id) return null;
  const on = choice === "accepted";
  return (
    <p className="flex flex-wrap items-center gap-3">
      <span>{on ? "Counting visits is on in this browser." : "Counting visits is off in this browser."}</span>
      <Button variant="outline" size="sm" onClick={() => writeChoice(on ? "declined" : "accepted")}>
        {on ? "Turn it off" : "Turn it on"}
      </Button>
    </p>
  );
}
