"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { approveShare, createShare, joinLink, lastViewedText, MAX_SHARES, removeShare, shareStatusText, type Invitation, type Share } from "@/lib/sharing";

type Busy = { id: string; what: "approving" | "removing" };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`${copied ? "Copied" : "Copy"} ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

const nameOf = (share: Share) => share.viewer_email ?? share.label ?? "Unnamed invitation";

/**
 * Where a person lets family or friends look at their dashboard, and only look. An invitation is a link and a code shown
 * once. When the other person has used them the owner sees who asked and approves, and can take access away at any time.
 */
export function SharingPanel({ initial }: { initial: Share[] }) {
  const [shares, setShares] = useState(initial);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ invitation: Invitation; link: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const full = shares.length >= MAX_SHARES;

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setFormError(null);
    const outcome = await createShare(label.trim());
    setCreating(false);
    if (!outcome.ok) return setFormError(outcome.message);
    const invitation = outcome.result;
    setFresh({ invitation, link: joinLink(window.location.origin, invitation.token) });
    setShares((current) => [
      ...current,
      { id: invitation.id, label: label.trim() || null, status: "invited", viewer_email: null, created_at: new Date().toISOString(), expires_at: invitation.expires_at, last_viewed_at: null },
    ]);
    setLabel("");
  }

  async function approve(share: Share) {
    setBusy({ id: share.id, what: "approving" });
    setRowError(null);
    const outcome = await approveShare(share.id);
    setBusy(null);
    if (!outcome.ok) return setRowError({ id: share.id, message: outcome.message });
    setShares((current) => current.map((item) => (item.id === share.id ? { ...item, status: "active", expires_at: null } : item)));
  }

  async function remove(share: Share) {
    setBusy({ id: share.id, what: "removing" });
    setRowError(null);
    const outcome = await removeShare(share.id);
    setBusy(null);
    if (!outcome.ok) return setRowError({ id: share.id, message: outcome.message });
    setShares((current) => current.filter((item) => item.id !== share.id));
    if (fresh?.invitation.id === share.id) setFresh(null);
  }

  return (
    <section id="sharing" aria-labelledby="sharing-heading" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 id="sharing-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Share your dashboard
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        Let family or friends look at your dashboard: your documents, what was found in them and how long your lease has left. They can only look. They
        cannot change anything or open your files. Up to {MAX_SHARES} people.
      </p>

      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-foreground">
          Who is it for? (optional)
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={100}
            placeholder="For example, Mum"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <Button type="submit" size="lg" disabled={creating || full}>
          {creating ? "Creating..." : "Create invitation"}
        </Button>
      </form>
      {full && <p className="mt-2 text-sm text-muted-foreground">All {MAX_SHARES} places are used. Remove someone to invite another.</p>}
      {formError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      {fresh && (
        <section aria-label="New invitation" className="mt-4 rounded-lg border border-primary/30 bg-accent/40 p-4">
          <p className="text-sm font-medium text-foreground">Send these to them. They are shown only now.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input readOnly aria-label="Invitation link" value={fresh.link} onFocus={(event) => event.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
            <CopyButton text={fresh.link} label="the link" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Code</span>
            <span aria-label="Invitation code" className="font-mono text-2xl font-semibold tracking-[0.3em] text-foreground">
              {fresh.invitation.code}
            </span>
            <CopyButton text={fresh.invitation.code} label="the code" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            It works for 7 days. They sign in with Google, open the link and enter the code, and then you approve them here. Send the code in a separate message if you can.
          </p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setFresh(null)}>
            Done
          </Button>
        </section>
      )}

      {shares.length > 0 && (
        <>
          <p className="mt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {shares.length} of {MAX_SHARES} places used
          </p>
          <ul aria-label="People with access" className="mt-2 flex flex-col gap-2">
            {shares.map((share) => {
              const working = busy?.id === share.id;
              const failed = rowError?.id === share.id ? rowError.message : null;
              return (
                <li key={share.id} className="rounded-lg border border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{nameOf(share)}</p>
                      <p className="text-xs text-muted-foreground">
                        {shareStatusText(share.status)}
                        {share.status === "active" && ` · ${lastViewedText(share.last_viewed_at)}`}
                      </p>
                    </div>
                    {share.status === "requested" && (
                      <Button type="button" size="sm" disabled={working} aria-label={`Approve ${nameOf(share)}`} onClick={() => approve(share)}>
                        {busy?.id === share.id && busy.what === "approving" ? "Approving..." : "Approve"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={working}
                      aria-label={`${share.status === "active" ? "Remove access for" : share.status === "requested" ? "Decline" : "Cancel invitation for"} ${nameOf(share)}`}
                      onClick={() => remove(share)}
                    >
                      {share.status === "active" ? "Remove access" : share.status === "requested" ? "Decline" : "Cancel invitation"}
                    </Button>
                  </div>
                  {failed && (
                    <p role="alert" className="mt-2 text-xs text-destructive">
                      {failed}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
