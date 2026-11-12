"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isInProgress, MAX_POLL_DURATION_MS, POLL_INTERVAL_MS, type DocumentSummary } from "@/lib/documents";
import { fetchChecklist, fetchKeyTerms } from "@/lib/overview";
import { retryDocument } from "@/lib/retry";
import { asShares } from "@/lib/sharing";
import type { TrackedDocument } from "@/lib/tracking";
import { addedNotice, preparingNotice, READING_HINT, requestNotice, settle, type Notice } from "@/lib/upload-notices";
import { cn } from "@/lib/utils";

type Toast = Notice & { id: number; names?: string[] };

type Notifications = {
  /** How a form that adds a document tells the rest of the site, so the person is told when it is ready on whatever page they are on. */
  uploaded: (document: DocumentSummary) => void;
  /** The documents being read now, and any that have just become ready, for the timeline on the Dashboard. */
  tracked: TrackedDocument[];
  /** How many people have asked to see this person's dashboard and are waiting for an answer. */
  pendingRequests: number;
  /** Looks again now, for after the person approves or declines one. */
  refreshRequests: () => void;
};

const NotificationsContext = createContext<Notifications>({ uploaded: () => {}, tracked: [], pendingRequests: 0, refreshRequests: () => {} });

export function useUploadNotifications() {
  return useContext(NotificationsContext);
}

/** How long a document that has just become ready stays in the timeline, so its last step is seen. */
const READY_SHOWN_MS = 12_000;
const REQUEST_CHECK_MS = 30_000;

const ICONS = {
  reading: <Loader2 aria-hidden="true" className="size-5 text-primary motion-safe:animate-spin" />,
  ready: <CheckCircle2 aria-hidden="true" className="size-5 text-emerald-600 dark:text-emerald-400" />,
  failed: <AlertTriangle aria-hidden="true" className="size-5 text-destructive" />,
  request: <UserPlus aria-hidden="true" className="size-5 text-primary" />,
};

function ToastCard({ toast, onClose, onRetry }: { toast: Toast; onClose: () => void; onRetry: (documentId: string) => void }) {
  const [paused, setPaused] = useState(false);
  const { closeAfterMs } = toast;

  // It goes away by itself after its time, but never while it is being read: hovering or focusing it holds it still.
  useEffect(() => {
    if (closeAfterMs === null || paused) return;
    const timer = setTimeout(onClose, closeAfterMs);
    return () => clearTimeout(timer);
  }, [closeAfterMs, paused, onClose]);

  const { action } = toast;
  return (
    <li>
      <div
        role={toast.kind === "failed" ? "alert" : "status"}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className={cn(
          "pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-card-foreground shadow-lg",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-300",
          toast.kind === "failed" ? "border-destructive/40" : "border-border",
        )}
      >
        <span className="mt-0.5 shrink-0">{ICONS[toast.kind]}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words text-foreground">{toast.title}</p>
          {toast.body && <p className="mt-1 text-muted-foreground">{toast.body}</p>}
          {action && "href" in action && (
            <Link href={action.href} onClick={onClose} className="mt-2 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {action.label}
            </Link>
          )}
          {action && "run" in action && (
            <Button type="button" size="sm" className="mt-2" onClick={() => onRetry(action.documentId)}>
              {action.label}
            </Button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}

/**
 * Tells the person what is happening to the documents they add, in small notes in the corner, on whatever page they are on.
 * Adding one says it was added and that reading takes a little while. When a document is ready there is a note with a link to it,
 * and when one could not be read there is a note with a way to try again. Several ready together are one note. Nothing takes
 * the keyboard focus, the notes are read out politely, and they only move for people who have not asked for less motion.
 */
export function UploadNotifications({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const watching = useRef(new Map<string, number>()); // document id -> when it began to be watched
  const [watchedCount, setWatchedCount] = useState(0);
  const nextId = useRef(0);
  // Documents whose summary and questions have been worked out, and those being worked out now.
  const prepared = useRef(new Set<string>());
  const preparing = useRef(new Set<string>());
  const unseen = useRef(0);
  const baseTitle = useRef<string | null>(null);

  const dismiss = useCallback((id: number) => setToasts((previous) => previous.filter((toast) => toast.id !== id)), []);

  const push = useCallback((notice: Notice) => {
    setToasts((previous) => [...previous, { ...notice, id: nextId.current++ }]);
  }, []);

  const [tracked, setTracked] = useState<Record<string, TrackedDocument>>({});
  const [pendingRequests, setPendingRequests] = useState(0);
  const knownRequests = useRef<Set<string> | null>(null);
  const looking = useRef(false);
  const lookRef = useRef<() => Promise<void>>(async () => {});

  const track = useCallback((document: DocumentSummary) => {
    setTracked((previous) => ({ ...previous, [document.id]: { document, prepared: previous[document.id]?.prepared ?? false } }));
  }, []);

  const untrack = useCallback((ids: string[]) => {
    setTracked((previous) => {
      if (!ids.some((id) => id in previous)) return previous;
      const next = { ...previous };
      for (const id of ids) delete next[id];
      return next;
    });
  }, []);

  const uploaded = useCallback(
    (document: DocumentSummary) => {
      watching.current.set(document.id, Date.now());
      setWatchedCount(watching.current.size);
      track(document);
      setToasts((previous) => {
        const open = previous.find((toast) => toast.kind === "reading" && toast.names);
        if (!open) return [...previous, { ...addedNotice([document.filename]), id: nextId.current++, names: [document.filename] }];
        const names = [...(open.names ?? []), document.filename];
        return previous.map((toast) => (toast.id === open.id ? { ...toast, ...addedNotice(names), names } : toast));
      });
    },
    [track],
  );

  // One look at the list: the timeline follows what the server says, documents that have been read are prepared, and the person is told.
  const look = useCallback(async () => {
    if (looking.current) return;
    looking.current = true;
    try {
      const expired: string[] = [];
      for (const [id, since] of watching.current) {
        if (Date.now() - since >= MAX_POLL_DURATION_MS) {
          watching.current.delete(id);
          expired.push(id);
        }
      }
      if (expired.length > 0) untrack(expired);
      if (watching.current.size === 0) {
        setWatchedCount(0);
        return;
      }
      const res = await fetch("/api/backend/documents");
      if (!res.ok) return;
      const fresh: DocumentSummary[] = await res.json();
      const byId = new Map(fresh.map((document) => [document.id, document]));
      const followed = [...watching.current.keys()]; // taken now: the set changes below, before the update is applied
      setTracked((previous) => {
        const next = { ...previous };
        for (const id of followed) {
          const latest = byId.get(id);
          if (latest) next[id] = { document: latest, prepared: prepared.current.has(id) };
          else delete next[id];
        }
        return next;
      });
      const result = settle(new Set(watching.current.keys()), fresh, prepared.current);
      // A document that has been read is worked on in the background first, so "ready" is only said when opening it is quick.
      const starting = result.toPrepare.filter((document) => !preparing.current.has(document.id));
      if (starting.length > 0) {
        for (const document of starting) {
          preparing.current.add(document.id);
          void Promise.all([fetchKeyTerms(document.id), fetchChecklist(document.id)]).then(() => {
            prepared.current.add(document.id);
            preparing.current.delete(document.id);
            setTracked((previous) => (previous[document.id] ? { ...previous, [document.id]: { ...previous[document.id], prepared: true } } : previous));
            void lookRef.current(); // say so now, not at the next look
          });
        }
        setToasts((previous) => [
          ...previous.filter((toast) => toast.kind !== "reading"),
          { ...preparingNotice(starting.map((document) => document.filename)), id: nextId.current++ },
        ]);
      }
      for (const id of [...watching.current.keys()]) if (!result.stillWatching.has(id)) watching.current.delete(id);
      setWatchedCount(watching.current.size);
      if (!result.changed) return;
      untrack(result.failedIds);
      for (const id of result.readyIds) setTimeout(() => untrack([id]), READY_SHOWN_MS);
      router.refresh(); // the numbers and the list on the page behind flip as well
      setToasts((previous) => previous.filter((toast) => toast.kind !== "reading"));
      for (const notice of result.notices) push(notice);
      const ready = result.notices.find((notice) => notice.kind === "ready");
      if (ready && document.hidden) {
        baseTitle.current ??= document.title;
        unseen.current += ready.title.endsWith("documents are ready") ? Number.parseInt(ready.title, 10) : 1;
        document.title = `(${unseen.current}) Ready | ${baseTitle.current}`;
      }
    } catch {
      // A network blip: the next look tries again.
    } finally {
      looking.current = false;
    }
  }, [push, router, untrack]);

  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  // While anything added here is still being read, look again every few seconds, wherever the person is.
  useEffect(() => {
    if (watchedCount === 0) return;
    const timer = setInterval(() => void lookRef.current(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [watchedCount]);

  // After a reload, anything still being read is picked up again, so the timeline and the notes carry on.
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const res = await fetch("/api/backend/documents");
        if (!res.ok || !current) return;
        const list: DocumentSummary[] = await res.json();
        const reading = list.filter((document) => isInProgress(document.status));
        for (const document of reading) {
          if (watching.current.has(document.id)) continue; // already followed since it was added here: what it holds is newer
          watching.current.set(document.id, Date.now());
          track(document);
        }
        if (reading.length > 0) setWatchedCount(watching.current.size);
      } catch {
        // Nothing to carry on with.
      }
    })();
    return () => {
      current = false;
    };
  }, [track]);

  // Someone using this person's share link and code is waiting to be let in: say so on the bar, and with a note when it is new.
  const checkRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/backend/shares");
      if (!res.ok) return;
      const waiting = asShares(await res.json()).filter((share) => share.status === "requested");
      setPendingRequests(waiting.length);
      const known = knownRequests.current;
      knownRequests.current = new Set(waiting.map((share) => share.id));
      if (known === null) return; // the first look only sets the count: what was already waiting is not news
      for (const share of waiting) {
        if (!known.has(share.id)) push(requestNotice(share.viewer_name || share.viewer_email || "Someone"));
      }
    } catch {
      // The next look tries again.
    }
  }, [push]);

  useEffect(() => {
    const first = setTimeout(() => void checkRequests(), 0);
    const timer = setInterval(() => void checkRequests(), REQUEST_CHECK_MS);
    const back = () => {
      if (!document.hidden) void checkRequests();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [checkRequests]);

  // Coming back to the tab puts its title back.
  useEffect(() => {
    function back() {
      if (document.hidden || baseTitle.current === null) return;
      document.title = baseTitle.current;
      baseTitle.current = null;
      unseen.current = 0;
    }
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, []);

  const retry = useCallback(async (toastId: number, documentId: string) => {
    const outcome = await retryDocument(documentId);
    if (!outcome.ok) {
      setToasts((previous) => previous.map((item) => (item.id === toastId ? { ...item, body: outcome.message } : item)));
      return;
    }
    dismiss(toastId);
    watching.current.set(documentId, Date.now());
    setWatchedCount(watching.current.size);
    track(outcome.document);
    push({ kind: "reading", title: `Reading ${outcome.document.filename} again`, body: READING_HINT, closeAfterMs: 7000 });
    router.refresh();
  }, [dismiss, push, router, track]);

  const value = useMemo(
    () => ({ uploaded, tracked: Object.values(tracked), pendingRequests, refreshRequests: () => void checkRequests() }),
    [uploaded, tracked, pendingRequests, checkRequests],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <section aria-label="Notifications" className="pointer-events-none fixed right-4 bottom-4 max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 w-[min(100vw-2rem,24rem)] print:hidden">
        <ul className="flex flex-col gap-2">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} onRetry={(documentId) => void retry(toast.id, documentId)} />
          ))}
        </ul>
      </section>
    </NotificationsContext.Provider>
  );
}
