"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { personLabel } from "@/lib/profile";
import { inviteTokenFrom, joinShare } from "@/lib/sharing";

/**
 * Where someone who was sent a share link and a six digit code types them in, without needing to open the link first.
 * Pasting the whole link is enough: the secret part is picked out of it. When the code is right the request goes to the
 * owner, and the list refreshes to show it waiting for their approval.
 */
export function JoinByLink() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = inviteTokenFrom(link);
    if (!token) return setError("That doesn't look like a share link. Paste the whole link you were sent.");
    setBusy(true);
    setError(null);
    const outcome = await joinShare(token, code);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setSentTo(personLabel(outcome.result.owner_name, outcome.result.owner_email));
    setLink("");
    setCode("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Share link
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste the link you were sent"
          autoComplete="off"
          spellCheck={false}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Six digit code
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-11 w-48 rounded-lg border border-input bg-background px-3 font-mono text-lg tracking-[0.35em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {sentTo && (
        <p role="status" className="text-sm text-foreground">
          Your request was sent to <strong className="font-semibold">{sentTo}</strong>. Their dashboard appears here once they approve it.
        </p>
      )}
      <div>
        <Button type="submit" size="lg" disabled={busy || code.length !== 6 || link.trim() === ""}>
          {busy ? "Checking..." : "Ask for access"}
        </Button>
      </div>
    </form>
  );
}
