"use client";

import Link from "next/link";
import { Circle, CircleCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LeaseRemainingRow } from "@/components/lease-countdown";
import { ReminderDialog, type DocumentChoice, type ReminderRequest } from "@/components/reminder-dialog";
import { Button } from "@/components/ui/button";
import { localToday, toISODate, type PlainDate } from "@/lib/dates";
import type { LeaseEnd } from "@/lib/lease-end";
import { asReminders, errorText, parseISODate, splitReminders, whenText, type Reminder } from "@/lib/reminders";
import { cn } from "@/lib/utils";

const API = "/api/backend/me/reminders";
/** How many reminders to show before "Show all", so a long list does not push the rest of the dashboard down. */
const SHOWN = 5;

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** Asks the website's own route and gives back the answer, or a sentence to show when it did not work. */
async function ask(path: string, init: RequestInit): Promise<Outcome<unknown>> {
  try {
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
    if (!response.ok) return { ok: false, error: await errorText(response) };
    return { ok: true, data: response.status === 204 ? null : await response.json() };
  } catch {
    return { ok: false, error: "Could not reach Brief. Check your connection and try again." };
  }
}

const groupHeading = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
const iconButton =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 disabled:pointer-events-none disabled:opacity-50 max-sm:size-11 motion-reduce:transition-none";

/**
 * The dashboard's Reminders card. It holds two kinds of reminder, kept apart by a small heading each: the ones Brief finds in a person's
 * documents (today, how long the lease has left, with a bell that hands the date to their calendar), and the ones the person writes
 * themselves with the plus button. A reminder of their own can be changed, ticked off, brought back and deleted, and is kept in the
 * database for that person alone. Brief only shows reminders. It does not send an email, a text or a notification, and this card
 * never says it will.
 */
export function RemindersCard({
  initial,
  loadFailed,
  documents,
  lease,
  todayISO,
}: {
  initial: Reminder[];
  /** The backend could not be asked for the reminders just now. */
  loadFailed: boolean;
  documents: DocumentChoice[];
  lease: LeaseEnd | null;
  /** The server's idea of today, so the first paint matches. It is replaced by the browser's own a moment later. */
  todayISO: string;
}) {
  const [items, setItems] = useState(initial);
  const [today, setToday] = useState<PlainDate>(() => parseISODate(todayISO) ?? localToday());
  const [dialog, setDialog] = useState<{ open: boolean; editing: Reminder | null }>({ open: false, editing: null });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const plusButton = useRef<HTMLButtonElement>(null);

  // The person's own date, once the page has loaded, so a reminder for "today" is today where they are and not where the server is.
  useEffect(() => {
    const id = window.setTimeout(() => setToday(localToday()), 0);
    return () => window.clearTimeout(id);
  }, []);

  // A message is a passing thing: it clears itself.
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), message.kind === "ok" ? 4000 : 8000);
    return () => window.clearTimeout(id);
  }, [message]);

  const { open, done } = splitReminders(items);
  const visible = showAll ? open : open.slice(0, SHOWN);

  const busy = (id: string, on: boolean) =>
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const replace = (saved: Reminder) =>
    setItems((current) => (current.some((item) => item.id === saved.id) ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved]));

  async function save(body: ReminderRequest, editing: Reminder | null): Promise<string | null> {
    const outcome = editing
      ? await ask(`${API}/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify(body) })
      : await ask(API, { method: "POST", body: JSON.stringify(body) });
    if (!outcome.ok) return outcome.error;
    const [saved] = asReminders([outcome.data]);
    if (!saved) return "Something went wrong on our side. Please try again in a moment.";
    replace(saved);
    setMessage({ kind: "ok", text: editing ? "Reminder updated." : "Reminder added." });
    return null;
  }

  async function toggle(reminder: Reminder) {
    if (pending.has(reminder.id)) return;
    busy(reminder.id, true);
    const outcome = await ask(`${API}/${encodeURIComponent(reminder.id)}`, { method: "PATCH", body: JSON.stringify({ completed: !reminder.completed }) });
    busy(reminder.id, false);
    const [saved] = outcome.ok ? asReminders([outcome.data]) : [];
    if (!saved) {
      setMessage({ kind: "error", text: outcome.ok ? "Something went wrong on our side. Please try again in a moment." : outcome.error });
      return;
    }
    replace(saved);
    setMessage({ kind: "ok", text: saved.completed ? "Marked as done." : "Moved back to your reminders." });
  }

  async function remove(reminder: Reminder) {
    if (pending.has(reminder.id)) return;
    busy(reminder.id, true);
    const outcome = await ask(`${API}/${encodeURIComponent(reminder.id)}`, { method: "DELETE" });
    busy(reminder.id, false);
    setConfirming(null);
    if (!outcome.ok) {
      setMessage({ kind: "error", text: outcome.error });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== reminder.id));
    setMessage({ kind: "ok", text: "Reminder deleted." });
  }

  const row = (reminder: Reminder) => {
    const when = whenText(reminder, today);
    const working = pending.has(reminder.id);
    return (
      <li key={reminder.id} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-2.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-0">
          <button
            type="button"
            aria-pressed={reminder.completed}
            aria-label={reminder.completed ? `Mark as not done: ${reminder.title}` : `Mark as done: ${reminder.title}`}
            disabled={working}
            onClick={() => void toggle(reminder)}
            className={cn(iconButton, reminder.completed ? "text-primary" : "")}
          >
            {reminder.completed ? <CircleCheck aria-hidden="true" className="size-5" /> : <Circle aria-hidden="true" className="size-5" />}
          </button>
          <div className="min-w-[9rem] flex-1 py-1.5">
            <p className={cn("text-sm font-medium break-words text-foreground", reminder.completed && "text-muted-foreground line-through")}>{reminder.title}</p>
            <p className={cn("text-xs", when.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{when.text}</p>
            {reminder.documentId && reminder.documentName && (
              <p className="text-xs break-words text-muted-foreground">
                About{" "}
                <Link href={`/dashboard/documents/${reminder.documentId}`} className="underline underline-offset-2 hover:text-foreground">
                  {reminder.documentName}
                </Link>
              </p>
            )}
            {reminder.description && <p className="mt-1 line-clamp-2 text-xs break-words text-muted-foreground">{reminder.description}</p>}
          </div>
          <div className="ml-auto flex shrink-0 items-center">
            <button type="button" aria-label={`Edit reminder: ${reminder.title}`} disabled={working} onClick={() => setDialog({ open: true, editing: reminder })} className={iconButton}>
              <Pencil aria-hidden="true" className="size-4" />
            </button>
            <button type="button" aria-label={`Delete reminder: ${reminder.title}`} disabled={working} onClick={() => setConfirming(reminder.id)} className={iconButton}>
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
        {confirming === reminder.id && (
          <div role="group" aria-label={`Delete ${reminder.title}?`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/5 px-3 py-2">
            <p className="text-sm text-foreground">Delete this reminder?</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(null)}>
                Keep it
              </Button>
              <Button type="button" variant="destructive" size="sm" disabled={working} onClick={() => void remove(reminder)}>
                {working ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <section aria-label="Reminders" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Reminders</h2>
        <button
          ref={plusButton}
          type="button"
          aria-label="Add a reminder"
          onClick={() => setDialog({ open: true, editing: null })}
          className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-[background-color,transform] duration-150 outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 max-sm:size-11 motion-reduce:transition-none"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </div>

      {/* Always on the page, so a screen reader hears a message when it appears. */}
      <p role={message?.kind === "error" ? "alert" : "status"} aria-live="polite" className={cn("text-sm", message ? (message.kind === "error" ? "text-destructive" : "text-foreground") : "sr-only")}>
        {message?.text ?? ""}
      </p>

      {lease && (
        <div className="flex flex-col gap-2">
          <h3 className={groupHeading}>From your documents</h3>
          <LeaseRemainingRow lease={lease} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className={groupHeading}>Your reminders</h3>
        {loadFailed && <p className="text-sm text-muted-foreground">Your reminders could not be loaded just now. Refresh the page to try again.</p>}
        {!loadFailed && open.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {done.length > 0 ? "Everything is done." : "Nothing here yet. Press + to add a reminder, such as calling your landlord or renewing a lease."}
          </p>
        )}
        {visible.length > 0 && <ul className="flex flex-col gap-2">{visible.map(row)}</ul>}
        {open.length > SHOWN && (
          <Button type="button" variant="ghost" size="sm" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)} className="self-start">
            {showAll ? "Show fewer" : `Show all ${open.length}`}
          </Button>
        )}
        {done.length > 0 && (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="ghost" size="sm" aria-expanded={showDone} onClick={() => setShowDone((current) => !current)} className="self-start">
              {showDone ? "Hide done" : `Show done (${done.length})`}
            </Button>
            {showDone && <ul className="flex flex-col gap-2">{done.map(row)}</ul>}
          </div>
        )}
      </div>

      <ReminderDialog
        open={dialog.open}
        reminder={dialog.editing}
        documents={documents}
        todayISO={toISODate(today)}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
        onSave={save}
      />
    </section>
  );
}
