import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { ReminderBell } from "@/components/reminder-bell";
import type { LeaseEnd } from "@/lib/lease-end";
import { cn } from "@/lib/utils";

/** How long is left, in the words a person would use. */
export function leaseDaysText(days: number): string {
  if (days < 0) return days === -1 ? "Ended yesterday" : `Ended ${-days} days ago`;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `${days} days left`;
}

/** One small card: how long the lease that ends soonest has left. Shown only when a clear end date was found. */
export function LeaseCountdown({ lease, linked = true }: { lease: LeaseEnd | null; linked?: boolean }) {
  if (!lease) return null;
  const soon = lease.days >= 0 && lease.days <= 60;
  return (
    <section
      aria-label="Lease remaining"
      className={cn("flex flex-col gap-4 rounded-2xl border p-5", soon ? "border-amber-500/40 bg-amber-50 dark:bg-amber-500/10" : "border-border bg-card")}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Reminders</h2>
        {linked && lease.days >= 0 && <ReminderBell documentId={lease.documentId} filename={lease.filename} value={lease.value} />}
      </div>
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Lease remaining</p>
          <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">{leaseDaysText(lease.days)}</p>
          <p className="truncate text-sm text-muted-foreground">
            Ends {lease.value} ·{" "}
            {linked ? (
              <Link href={`/dashboard/documents/${lease.documentId}`} className="inline-flex underline underline-offset-2 max-sm:min-h-11 max-sm:items-center hover:text-foreground">
                {lease.filename}
              </Link>
            ) : (
              lease.filename
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
