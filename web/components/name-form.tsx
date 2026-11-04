"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { MAX_NAME_LENGTH, saveName } from "@/lib/name";

const INPUT = "h-10 w-full rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** First and last name, with a Save button. Used when someone first signs in and when they change their name later. */
export function NameForm({
  initialFirst = "",
  initialLast = "",
  submitLabel = "Continue",
  onSaved,
  onCancel,
}: {
  initialFirst?: string;
  initialLast?: string;
  submitLabel?: string;
  onSaved: (name: { first_name: string; last_name: string }) => void;
  onCancel?: () => void;
}) {
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await saveName(first, last);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    onSaved(outcome.result);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          First name
          <input value={first} onChange={(event) => setFirst(event.target.value)} maxLength={MAX_NAME_LENGTH} autoComplete="given-name" required className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Last name
          <input value={last} onChange={(event) => setLast(event.target.value)} maxLength={MAX_NAME_LENGTH} autoComplete="family-name" required className={INPUT} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={busy || !first.trim() || !last.trim()}>
          {busy ? "Saving..." : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
