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

/** The icon, how long is left, and which lease it is. */
function LeaseSummary({ lease, linked, wrap = false }: { lease: LeaseEnd; linked: boolean; wrap?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <CalendarClock className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Lease remaining</p>
        <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">{leaseDaysText(lease.days)}</p>
        <p className={cn("text-sm break-words text-muted-foreground", !wrap && "sm:truncate")}>
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
  );
}

const isSoon = (lease: LeaseEnd) => lease.days >= 0 && lease.days <= 60;

/**
 * One small card: how long the lease that ends soonest has left. Shown only when a clear end date was found. This is the card a person
 * who was invited to look at a dashboard sees; the owner's own Reminders card, which also holds their own reminders, is RemindersCard.
 */
export function LeaseCountdown({ lease, linked = true }: { lease: LeaseEnd | null; linked?: boolean }) {
  if (!lease) return null;
  return (
    <section
      aria-label="Lease remaining"
      className={cn("flex flex-col gap-4 rounded-2xl border p-5", isSoon(lease) ? "border-amber-500/40 bg-amber-50 dark:bg-amber-500/10" : "border-border bg-card")}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Reminders</h2>
        {linked && lease.days >= 0 && <ReminderBell documentId={lease.documentId} filename={lease.filename} value={lease.value} />}
      </div>
      <LeaseSummary lease={lease} linked={linked} />
    </section>
  );
}

/** The same lease, as one row inside the owner's Reminders card, with the bell that hands the date to their calendar. */
export function LeaseRemainingRow({ lease }: { lease: LeaseEnd }) {
  return (
    <section
      aria-label="Lease remaining"
      className={cn("flex items-center gap-3 rounded-xl border p-3", isSoon(lease) ? "border-amber-500/40 bg-amber-50 dark:bg-amber-500/10" : "border-border bg-background")}
    >
      {/* The row is narrower than the card on its own, so the file name wraps and is not cut off. */}
      <LeaseSummary lease={lease} linked wrap />
      {lease.days >= 0 && <ReminderBell documentId={lease.documentId} filename={lease.filename} value={lease.value} />}
    </section>
  );
}
