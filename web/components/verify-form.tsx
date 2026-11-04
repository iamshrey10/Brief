"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { verifyCode } from "@/lib/two-factor";

/** The second step of signing in: a code from the authenticator app, or a recovery code, and an option to remember this browser for thirty days. */
export function VerifyForm({ next, problem }: { next: string; problem: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(problem ? "Couldn't check your sign in just now. Try again in a moment." : null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await verifyCode(code, remember);
    if (!outcome.ok) {
      setBusy(false);
      return setError(outcome.message);
    }
    if (outcome.result.usedRecoveryCode) {
      setNotice("You used a recovery code. It cannot be used again. You can make a fresh set in Profile.");
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Code from your authenticator app
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          maxLength={32}
          aria-describedby="code-help"
          className="h-11 rounded-lg border border-input bg-background px-3 font-mono text-xl tracking-[0.3em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <p id="code-help" className="text-xs text-muted-foreground">
        Six digits. If you lost your phone, type one of your recovery codes instead.
      </p>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4" />
        Remember this browser for 30 days
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy || code.trim().length === 0}>
        {busy ? "Checking..." : "Verify"}
      </Button>
    </form>
  );
}
