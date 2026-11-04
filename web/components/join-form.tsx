"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { personLabel } from "@/lib/profile";
import { joinShare } from "@/lib/sharing";

/** Where someone who was sent an invitation link enters the six digit code, and then waits for the owner to approve. */
export function JoinForm({ token }: { token: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await joinShare(token, code);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setSentTo(personLabel(outcome.result.owner_name, outcome.result.owner_email));
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm text-foreground">
        <p>
          Your request was sent to <strong className="font-semibold">{sentTo}</strong>. Once they approve it, their dashboard appears under
          &ldquo;Shared with you&rdquo; on your Dashboard.
        </p>
        <Link href="/dashboard/profile#shared" className="font-medium underline underline-offset-2">
          Go to Profile
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Six digit code
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-describedby="join-help"
          className="h-11 rounded-lg border border-input bg-background px-3 font-mono text-xl tracking-[0.4em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <p id="join-help" className="text-xs text-muted-foreground">
        The person who invited you sent it with the link.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
        {busy ? "Checking..." : "Ask for access"}
      </Button>
    </form>
  );
}
