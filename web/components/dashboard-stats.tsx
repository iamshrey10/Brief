import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Loader2, type LucideIcon } from "lucide-react";

import type { DocumentStats } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

type Card = { label: string; value: number; hint: string; icon: LucideIcon; tone: string; spin?: boolean; attention?: boolean };

/**
 * The numbers at the top of the dashboard, each with an icon in its own color. A card that asks something of the person is
 * tinted so it is not missed, and the icon of a document being read turns while it is, unless the reader prefers less motion.
 */
export function DashboardStats({ stats, readOnly = false }: { stats: DocumentStats; readOnly?: boolean }) {
  const cards: Card[] = [
    { label: "Documents", value: stats.total, hint: stats.total === 0 ? "None yet" : "In your account", icon: FileText, tone: "bg-accent text-accent-foreground" },
    {
      label: "Ready to open",
      value: stats.ready,
      hint: "Read and ready for questions",
      icon: CheckCircle2,
      tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      label: "Being read",
      value: stats.reading,
      hint: stats.reading === 0 ? "Nothing waiting" : "Finishing now",
      icon: Loader2,
      tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
      spin: stats.reading > 0,
    },
    {
      label: "Needs attention",
      value: stats.needsAttention,
      hint: stats.needsAttention === 0 ? "Nothing to fix" : readOnly ? "Could not be read well" : "Could not be read well, open Documents",
      icon: AlertTriangle,
      tone: "bg-destructive/10 text-destructive",
      attention: stats.needsAttention > 0,
    },
  ];

  return (
    <section aria-label="Your documents at a glance">
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <li
              key={card.label}
              className={cn(
                "flex flex-col gap-0.5 rounded-2xl border p-5 max-sm:p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                card.attention ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{card.label}</span>
                <span aria-hidden="true" className={cn("flex size-8 items-center justify-center rounded-lg max-sm:size-7", card.tone)}>
                  <Icon className={cn("size-4", card.spin && "motion-safe:animate-spin")} />
                </span>
              </div>
              <span className="font-heading text-4xl font-semibold tracking-tight text-foreground max-sm:text-3xl">{card.value}</span>
              <span className={cn("text-xs", card.attention ? "text-destructive" : "text-muted-foreground")}>{card.hint}</span>
            </li>
          );
        })}
      </ul>
      {!readOnly && stats.needsAttention > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          <Link href="/dashboard/documents" className="inline-flex font-medium text-primary max-sm:min-h-11 max-sm:items-center underline-offset-4 hover:underline">
            Open your documents
          </Link>{" "}
          to read again or retake the ones that need it.
        </p>
      )}
    </section>
  );
}
