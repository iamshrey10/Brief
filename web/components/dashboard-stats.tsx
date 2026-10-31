import Link from "next/link";

import type { DocumentStats } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

type Card = { label: string; value: number; hint: string; attention?: boolean };

/** The numbers at the top of the dashboard. A card that asks something of the person is tinted, so it is not missed. */
export function DashboardStats({ stats }: { stats: DocumentStats }) {
  const cards: Card[] = [
    { label: "Documents", value: stats.total, hint: stats.total === 0 ? "None yet" : "In your account" },
    { label: "Ready to open", value: stats.ready, hint: "Read and ready for questions" },
    { label: "Being read", value: stats.reading, hint: stats.reading === 0 ? "Nothing waiting" : "Finishing now" },
    {
      label: "Needs attention",
      value: stats.needsAttention,
      hint: stats.needsAttention === 0 ? "Nothing to fix" : "Could not be read well, open Documents",
      attention: stats.needsAttention > 0,
    },
  ];

  return (
    <section aria-label="Your documents at a glance">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <li
            key={card.label}
            className={cn(
              "flex flex-col gap-1 rounded-2xl border p-5",
              card.attention ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
            )}
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{card.label}</span>
            <span className="font-heading text-4xl font-semibold tracking-tight text-foreground">{card.value}</span>
            <span className={cn("text-xs", card.attention ? "text-destructive" : "text-muted-foreground")}>{card.hint}</span>
          </li>
        ))}
      </ul>
      {stats.needsAttention > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          <Link href="/dashboard/documents" className="font-medium text-primary underline-offset-4 hover:underline">
            Open your documents
          </Link>{" "}
          to read again or retake the ones that need it.
        </p>
      )}
    </section>
  );
}
