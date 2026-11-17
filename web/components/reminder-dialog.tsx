"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formFromReminder,
  MAX_DESCRIPTION,
  MAX_TITLE,
  parseISODate,
  toRequestBody,
  validateReminder,
  type Reminder,
  type ReminderForm,
  type ReminderProblems,
} from "@/lib/reminders";

export type DocumentChoice = { id: string; filename: string };
export type ReminderRequest = ReturnType<typeof toRequestBody>;

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive max-sm:h-11";

/**
 * The window for adding a reminder, or changing one. It has a title and a date, which are required, and a time, a note and one of the
 * person's documents, which are not: a reminder does not need a document. A problem is said next to the field it belongs to, and a problem
 * from the server is said above the buttons. Saving cannot be pressed twice while it is waiting. Escape, Cancel or a click outside puts it
 * away without saving. It says plainly that Brief shows reminders and does not send alerts.
 */
export function ReminderDialog({
  open,
  reminder,
  documents,
  todayISO,
  onClose,
  onSave,
}: {
  open: boolean;
  /** The reminder being changed, or null when a new one is being added. */
  reminder: Reminder | null;
  documents: DocumentChoice[];
  todayISO: string;
  onClose: () => void;
  /** Saves it, and gives back what went wrong as a sentence, or null when it worked. */
  onSave: (body: ReminderRequest, reminder: Reminder | null) => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // The browser puts the cursor on the first thing it can, which is the Close button. A person who opened this to type wants the title.
      element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="reminder-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      className="reminder-dialog m-auto max-h-[92dvh] w-[min(94vw,30rem)] max-w-none overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60"
    >
      {open && <ReminderFormBody key={reminder?.id ?? "new"} reminder={reminder} documents={documents} todayISO={todayISO} onCancel={() => dialog.current?.close()} onSave={onSave} onDone={() => dialog.current?.close()} />}
    </dialog>
  );
}

function ReminderFormBody({
  reminder,
  documents,
  todayISO,
  onCancel,
  onSave,
  onDone,
}: {
  reminder: Reminder | null;
  documents: DocumentChoice[];
  todayISO: string;
  onCancel: () => void;
  onSave: (body: ReminderRequest, reminder: Reminder | null) => Promise<string | null>;
  onDone: () => void;
}) {
  const id = useId();
  const today = parseISODate(todayISO) ?? { year: new Date().getFullYear(), month: 1, day: 1 };
  const [form, setForm] = useState<ReminderForm>(() => (reminder ? formFromReminder(reminder) : { title: "", date: todayISO, time: "", description: "", documentId: "" }));
  const [problems, setProblems] = useState<ReminderProblems>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  // Set at once, before the screen has had time to show "Saving", so a double click cannot send the reminder twice.
  const busy = useRef(false);

  const set = (field: keyof ReminderForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in problems) setProblems((current) => ({ ...current, [field]: undefined }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const found = validateReminder(form, today, reminder?.dueDate ?? null);
    setProblems(found);
    const first = (["title", "date", "time", "description"] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    busy.current = true;
    setSaving(true);
    setServerError("");
    const problem = await onSave(toRequestBody(form), reminder);
    busy.current = false;
    if (problem) {
      setServerError(problem);
      setSaving(false);
    } else {
      onDone();
    }
  }

  const describe = (field: keyof ReminderProblems) => (problems[field] ? `${id}-${field}-problem` : undefined);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-5 max-sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="reminder-dialog-title" className="font-heading text-xl font-semibold tracking-tight text-foreground">
            {reminder ? "Edit reminder" : "Add a reminder"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Your reminders show on your dashboard. Brief does not send alerts or notifications.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onCancel}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        <span>
          Title <span className="font-normal text-muted-foreground">(required)</span>
        </span>
        <input
          id={`${id}-title`}
          autoFocus
          data-autofocus
          value={form.title}
          maxLength={MAX_TITLE}
          onChange={(event) => set("title", event.target.value)}
          aria-required="true"
          aria-invalid={problems.title ? true : undefined}
          aria-describedby={describe("title")}
          placeholder="For example: Call the landlord"
          className={fieldClass}
        />
        {problems.title && (
          <span id={`${id}-title-problem`} role="alert" className="text-xs font-normal text-destructive">
            {problems.title}
          </span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          <span>
            Date <span className="font-normal text-muted-foreground">(required)</span>
          </span>
          <input
            id={`${id}-date`}
            type="date"
            value={form.date}
            min={reminder ? undefined : todayISO}
            onChange={(event) => set("date", event.target.value)}
            aria-required="true"
            aria-invalid={problems.date ? true : undefined}
            aria-describedby={describe("date")}
            className={fieldClass}
          />
          {problems.date && (
            <span id={`${id}-date-problem`} role="alert" className="text-xs font-normal text-destructive">
              {problems.date}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          <span>
            Time <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            id={`${id}-time`}
            type="time"
            value={form.time}
            onChange={(event) => set("time", event.target.value)}
            aria-invalid={problems.time ? true : undefined}
            aria-describedby={describe("time")}
            className={fieldClass}
          />
          {problems.time && (
            <span id={`${id}-time-problem`} role="alert" className="text-xs font-normal text-destructive">
              {problems.time}
            </span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        <span>
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <textarea
          id={`${id}-description`}
          rows={3}
          maxLength={MAX_DESCRIPTION}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          aria-invalid={problems.description ? true : undefined}
          aria-describedby={describe("description")}
          className={`${fieldClass} h-auto min-h-20 py-2 leading-snug`}
        />
        {problems.description ? (
          <span id={`${id}-description-problem`} role="alert" className="text-xs font-normal text-destructive">
            {problems.description}
          </span>
        ) : (
          form.description.length > MAX_DESCRIPTION - 100 && (
            <span className="text-xs font-normal text-muted-foreground">
              {form.description.length} of {MAX_DESCRIPTION} characters
            </span>
          )
        )}
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        <span>
          Linked document <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <select
          id={`${id}-document`}
          value={form.documentId}
          onChange={(event) => set("documentId", event.target.value)}
          disabled={documents.length === 0 && !form.documentId}
          className={fieldClass}
        >
          <option value="">{documents.length === 0 ? "No documents yet" : "None, just a reminder"}</option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.filename}
            </option>
          ))}
        </select>
      </label>

      {serverError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2 max-sm:flex-col-reverse">
        <Button type="button" variant="outline" onClick={onCancel} >
          Cancel
        </Button>
        <Button type="submit" disabled={saving} aria-busy={saving} >
          {saving ? "Saving..." : reminder ? "Save changes" : "Add reminder"}
        </Button>
      </div>
    </form>
  );
}
