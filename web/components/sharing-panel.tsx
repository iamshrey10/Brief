"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AccessPicker } from "@/components/access-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { useUploadNotifications } from "@/components/upload-notifications";
import { buildShareEmail, looksLikeEmail } from "@/lib/share-email";
import { chosenAccessText, DEFAULT_ACCESS_HOURS, timeLeftText, type AccessChoice } from "@/lib/share-access";
import { approveShare, changeShareAccess, createShare, joinLink, lastViewedText, MAX_SHARES, removeShare, shareStatusText, type Invitation, type Share } from "@/lib/sharing";

type Busy = { id: string; what: "approving" | "removing" | "changing" };

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

/**
 * Email the invitation without copying anything: a short message with the link and the code already inside opens in the
 * person's own email, to read and send. Brief does not send it and does not keep it.
 */
function EmailIt({ ownerName, link, code, sendTo, onSendTo }: { ownerName: string; link: string; code: string; sendTo: string; onSendTo: (value: string) => void }) {
  const typed = sendTo.trim();
  const invalid = typed !== "" && !looksLikeEmail(typed);
  const email = buildShareEmail({ ownerName, link, code, to: typed });
  const linkClass = buttonVariants({ variant: "default", size: "sm" });
  return (
    <div className="mt-4 border-t border-primary/20 pt-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Their email address (optional)
        <input
          type="email"
          value={sendTo}
          onChange={(event) => onSendTo(event.target.value)}
          maxLength={254}
          autoComplete="off"
          placeholder="name@example.com"
          aria-invalid={invalid}
          aria-describedby={invalid ? "share-email-problem" : undefined}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {invalid && (
        <p id="share-email-problem" role="alert" className="mt-1.5 text-xs text-destructive">
          That does not look like an email address. Fix it, or leave it empty and type it in your email.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {invalid ? (
          <>
            <span className={`${linkClass} pointer-events-none opacity-50`} aria-disabled="true">Email it with Gmail</span>
            <span className={`${linkClass} pointer-events-none opacity-50`} aria-disabled="true">Email it with my mail app</span>
          </>
        ) : (
          <>
            <a href={email.gmailHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Email it with Gmail
            </a>
            <a href={email.mailtoHref} className={linkClass}>
              Email it with my mail app
            </a>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A short message with the link and the code opens in your own email, ready to send. Brief does not send it or keep it. The link and code sit in the same email, so the one thing that matters is your approval: nobody sees your dashboard until you approve them here.
      </p>
    </div>
  );
}

const nameOf = (share: Share) => share.viewer_name ?? share.viewer_email ?? share.label ?? "Unnamed invitation";

/**
 * Where a person lets family or friends look at their dashboard, and only look. An invitation is a link and a code shown
 * once. When the other person has used them the owner sees who asked and approves, and can take access away at any time.
 */
export function SharingPanel({ initial, ownerName = "" }: { initial: Share[]; ownerName?: string }) {
  const router = useRouter();
  const { pendingRequests, refreshRequests } = useUploadNotifications();
  const [shares, setShares] = useState(initial);
  // When the page is asked for again, what it brings replaces what is shown, so a new request appears without a reload.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setShares(initial);
  }
  // Someone asking, or an answer being given, changes the count on the bar: ask the page for the list again.
  const lastCount = useRef(pendingRequests);
  useEffect(() => {
    if (lastCount.current === pendingRequests) return; // not a change, and the same when an effect is run twice in development
    lastCount.current = pendingRequests;
    router.refresh();
  }, [pendingRequests, router]);
  const [label, setLabel] = useState("");
  // How long the new person may look once approved. Null only while a date has been asked for and not yet picked.
  const [access, setAccess] = useState<AccessChoice | null>({ kind: "hours", hours: DEFAULT_ACCESS_HOURS });
  // The person whose time is being changed, and what they have picked for it.
  const [changing, setChanging] = useState<string | null>(null);
  const [newAccess, setNewAccess] = useState<AccessChoice | null>({ kind: "hours", hours: DEFAULT_ACCESS_HOURS });
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ invitation: Invitation; link: string } | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const full = shares.length >= MAX_SHARES;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!access) return;
    setCreating(true);
    setFormError(null);
    const outcome = await createShare(label.trim(), access);
    setCreating(false);
    if (!outcome.ok) return setFormError(outcome.message);
    const invitation = outcome.result;
    setFresh({ invitation, link: joinLink(window.location.origin, invitation.token) });
    setShares((current) => [
      ...current,
      {
        id: invitation.id,
        label: label.trim() || null,
        status: "invited",
        viewer_email: null,
        viewer_name: null,
        created_at: new Date().toISOString(),
        expires_at: invitation.expires_at,
        last_viewed_at: null,
        access_hours: invitation.access_hours ?? null,
        access_until: invitation.access_until ?? null,
        access_ends_at: null,
      },
    ]);
    setLabel("");
  }

  async function approve(share: Share) {
    setBusy({ id: share.id, what: "approving" });
    setRowError(null);
    const outcome = await approveShare(share.id);
    setBusy(null);
    if (!outcome.ok) return setRowError({ id: share.id, message: outcome.message });
    // The time starts counting at approval, so the end is known only to the server: ask the page for the list again.
    setShares((current) => current.map((item) => (item.id === share.id ? { ...item, status: "active", expires_at: null } : item)));
    refreshRequests();
    router.refresh();
  }

  async function saveTime(share: Share) {
    if (!newAccess) return;
    setBusy({ id: share.id, what: "changing" });
    setRowError(null);
    const outcome = await changeShareAccess(share.id, newAccess);
    setBusy(null);
    if (!outcome.ok) return setRowError({ id: share.id, message: outcome.message });
    setChanging(null);
    router.refresh();
  }

  async function remove(share: Share) {
    setBusy({ id: share.id, what: "removing" });
    setRowError(null);
    const outcome = await removeShare(share.id);
    setBusy(null);
    if (!outcome.ok) return setRowError({ id: share.id, message: outcome.message });
    setShares((current) => current.filter((item) => item.id !== share.id));
    if (fresh?.invitation.id === share.id) setFresh(null);
    refreshRequests();
  }

  // People waiting to be let in come first, so a new request is the first thing seen.
  const ordered = [...shares].sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));

  return (
    <section id="sharing" data-tour="sharing" aria-labelledby="sharing-heading" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 id="sharing-heading" className="text-xl font-semibold tracking-tight text-foreground">
        Share your dashboard
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Let family or friends look at your dashboard: your documents, what was found in them and how long your lease has left. They can only look. They
        cannot change anything or open your files. Up to {MAX_SHARES} people.
      </p>

      <form onSubmit={create} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-foreground">
            Who is it for? (optional)
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={100}
              placeholder="For example, Mum"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <AccessPicker onChange={setAccess} stacked />
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">The time starts when you approve them, and ends by itself. You can give them more time, or remove them, whenever you like.</p>
        <Button type="submit" size="lg" className="max-sm:w-full sm:self-start" disabled={creating || full || !access}>
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

          <EmailIt ownerName={ownerName} link={fresh.link} code={fresh.invitation.code} sendTo={sendTo} onSendTo={setSendTo} />

          <p className="mt-3 text-xs text-muted-foreground">
            The link works for 7 days. They sign in with Google, open it and enter the code, and then you approve them here before they can see anything. After that they can look for{" "}
            {chosenAccessText(fresh.invitation.access_hours ?? null, fresh.invitation.access_until ?? null).replace(" once you approve", "")}.
          </p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { setFresh(null); setSendTo(""); }}>
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
            {ordered.map((share) => {
              const working = busy?.id === share.id;
              const failed = rowError?.id === share.id ? rowError.message : null;
              return (
                <li
                  key={share.id}
                  className={share.status === "requested" ? "rounded-lg border border-primary/50 bg-accent/40 px-4 py-3 ring-1 ring-primary/20" : "rounded-lg border border-border px-4 py-3"}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      {share.status === "requested" && (
                        <span className="mb-1 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">New request</span>
                      )}
                      <p className="truncate text-sm font-medium text-foreground">{nameOf(share)}</p>
                      {share.viewer_name && share.viewer_email && <p className="truncate text-xs text-muted-foreground">{share.viewer_email}</p>}
                      <p className="text-xs text-muted-foreground">
                        {shareStatusText(share.status)}
                        {share.status === "active" && ` · ${lastViewedText(share.last_viewed_at)}`}
                      </p>
                      {share.status === "active" && share.access_ends_at && (
                        <p className="mt-0.5 text-xs font-medium text-foreground">{timeLeftText(share.access_ends_at)}</p>
                      )}
                      {share.status !== "active" && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Can look for {chosenAccessText(share.access_hours, share.access_until)}</p>
                      )}
                    </div>
                    {share.status === "active" && (
                      <Button type="button" variant="outline" size="sm" disabled={working} aria-label={`Change the time for ${nameOf(share)}`} onClick={() => setChanging(changing === share.id ? null : share.id)}>
                        Change time
                      </Button>
                    )}
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
                  {changing === share.id && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                      <AccessPicker label="Give them time from now" onChange={setNewAccess} />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={working || !newAccess} onClick={() => saveTime(share)}>
                          {busy?.id === share.id && busy.what === "changing" ? "Saving..." : "Save time"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => setChanging(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
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
