"use client";

import { Briefcase, Compass, Home, Landmark, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { MAX_NAME_LENGTH, saveName } from "@/lib/name";
import { REASONS, type SignupReason } from "@/lib/welcome-reasons";

const INPUT = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const ICONS: Record<SignupReason, LucideIcon> = { lease: Home, loan: Landmark, job_offer: Briefcase, exploring: Compass };

/**
 * The first screen after a first sign in: why the person came, and the name other people will see.
 * The reason is optional. It is only ever counted, to show what Brief is used for, and never shown to anyone else.
 */
export function WelcomeSetup({ initialFirst, initialLast, email }: { initialFirst: string; initialLast: string; email: string }) {
  const router = useRouter();
  const [reason, setReason] = useState<SignupReason | undefined>(undefined);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await saveName(first, last, reason);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    // Next, the offer of a second lock on the account.
    router.push("/dashboard/profile#two-step");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="font-heading text-lg font-semibold tracking-tight text-foreground">What brings you to Brief today?</legend>
        <p className="-mt-1 text-sm text-muted-foreground">Pick one so we can show you the right things first. You can skip this.</p>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {REASONS.map((choice) => {
            const Icon = ICONS[choice.value];
            return (
              <label
                key={choice.value}
                className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:ring-2 has-[:checked]:ring-primary/40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="radio"
                  name="reason"
                  value={choice.value}
                  checked={reason === choice.value}
                  onChange={() => setReason(choice.value)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-medium text-foreground">{choice.title}</span>
                  <span className="text-sm text-muted-foreground">{choice.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">And what should we call you?</h2>
        <p className="-mt-1 text-sm text-muted-foreground">
          If you share your dashboard, people see this name instead of your email address ({email}).
        </p>
        <div className="mt-1 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            First name
            <input value={first} onChange={(event) => setFirst(event.target.value)} maxLength={MAX_NAME_LENGTH} autoComplete="given-name" required className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Last name
            <input value={last} onChange={(event) => setLast(event.target.value)} maxLength={MAX_NAME_LENGTH} autoComplete="family-name" required className={INPUT} />
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 text-base max-sm:w-full" disabled={busy || !first.trim() || !last.trim()}>
        {busy ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
