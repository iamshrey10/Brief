"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MAX_POLL_DURATION_MS, POLL_INTERVAL_MS, type DocumentSummary } from "@/lib/documents";
import { retryDocument } from "@/lib/retry";
import { addedNotice, READING_HINT, settle, type Notice } from "@/lib/upload-notices";
import { cn } from "@/lib/utils";

type Toast = Notice & { id: number; names?: string[] };

const NotificationsContext = createContext<{ uploaded: (document: DocumentSummary) => void }>({ uploaded: () => {} });

/** How a form that adds a document tells the rest of the site, so the person is told when it is ready on whatever page they are on. */
export function useUploadNotifications() {
  return useContext(NotificationsContext);
}

const ICONS = {
  reading: <Loader2 aria-hidden="true" className="size-5 text-primary motion-safe:animate-spin" />,
  ready: <CheckCircle2 aria-hidden="true" className="size-5 text-emerald-600 dark:text-emerald-400" />,
  failed: <AlertTriangle aria-hidden="true" className="size-5 text-destructive" />,
};

function ToastCard({ toast, onClose, onRetry }: { toast: Toast; onClose: () => void; onRetry: () => void }) {
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
            <Button type="button" size="sm" className="mt-2" onClick={onRetry}>
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
  const unseen = useRef(0);
  const baseTitle = useRef<string | null>(null);

  const dismiss = useCallback((id: number) => setToasts((previous) => previous.filter((toast) => toast.id !== id)), []);

  const push = useCallback((notice: Notice) => {
    setToasts((previous) => [...previous, { ...notice, id: nextId.current++ }]);
  }, []);

  const uploaded = useCallback((document: DocumentSummary) => {
    watching.current.set(document.id, Date.now());
    setWatchedCount(watching.current.size);
    setToasts((previous) => {
      const open = previous.find((toast) => toast.kind === "reading" && toast.names);
      if (!open) return [...previous, { ...addedNotice([document.filename]), id: nextId.current++, names: [document.filename] }];
      const names = [...(open.names ?? []), document.filename];
      return previous.map((toast) => (toast.id === open.id ? { ...toast, ...addedNotice(names), names } : toast));
    });
  }, []);

  // While anything added here is still being read, look again every few seconds, wherever the person is.
  useEffect(() => {
    if (watchedCount === 0) return;
    const timer = setInterval(async () => {
      for (const [id, since] of watching.current) {
        if (Date.now() - since >= MAX_POLL_DURATION_MS) watching.current.delete(id);
      }
      if (watching.current.size === 0) {
        setWatchedCount(0);
        return;
      }
      try {
        const res = await fetch("/api/backend/documents");
        if (!res.ok) return;
        const fresh: DocumentSummary[] = await res.json();
        const result = settle(new Set(watching.current.keys()), fresh);
        for (const id of [...watching.current.keys()]) if (!result.stillWatching.has(id)) watching.current.delete(id);
        setWatchedCount(watching.current.size);
        if (!result.changed) return;
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
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [watchedCount, push, router]);

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

  const retry = useCallback(async (toast: Toast) => {
    if (!toast.action || !("run" in toast.action)) return;
    const { documentId } = toast.action;
    const outcome = await retryDocument(documentId);
    if (!outcome.ok) {
      setToasts((previous) => previous.map((item) => (item.id === toast.id ? { ...item, body: outcome.message } : item)));
      return;
    }
    dismiss(toast.id);
    watching.current.set(documentId, Date.now());
    setWatchedCount(watching.current.size);
    push({ kind: "reading", title: `Reading ${outcome.document.filename} again`, body: READING_HINT, closeAfterMs: 7000 });
    router.refresh();
  }, [dismiss, push, router]);

  const value = useMemo(() => ({ uploaded }), [uploaded]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <section aria-label="Notifications" className="pointer-events-none fixed right-4 bottom-4 z-50 w-[min(100vw-2rem,24rem)] print:hidden">
        <ul className="flex flex-col gap-2">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} onRetry={() => void retry(toast)} />
          ))}
        </ul>
      </section>
    </NotificationsContext.Provider>
  );
}
