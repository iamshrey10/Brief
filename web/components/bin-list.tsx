"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { DocTypeIcon } from "@/components/doc-type-icon";
import { Button } from "@/components/ui/button";
import { deleteForGood, restoreDocument } from "@/lib/document-actions";
import { DOC_TYPE_LABELS } from "@/lib/documents";
import { daysLeftText, deletedText, isRunningOut, type TrashedDocument } from "@/lib/trash";
import { cn } from "@/lib/utils";

type Pending = { id: string; kind: "restoring" | "confirming" | "deleting" };

/**
 * The documents in the bin: each with when it was deleted and how long is left to restore it, a Restore button, and Delete forever,
 * which asks first. A restored or deleted document leaves the list at once, and one line says what happened. A failure says why, and
 * leaves the document where it was, so nothing is lost by trying.
 */
export function BinList({ initial }: { initial: TrashedDocument[] }) {
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  function leave(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setPending(null);
  }

  async function restore(item: TrashedDocument) {
    setPending({ id: item.id, kind: "restoring" });
    setError(null);
    setNotice(null);
    const outcome = await restoreDocument(item.id);
    if (outcome.ok) {
      leave(item.id);
      setNotice(`${item.filename} was restored.`);
      return;
    }
    setPending(null);
    setError({ id: item.id, message: outcome.message });
  }

  async function removeForGood(item: TrashedDocument) {
    setPending({ id: item.id, kind: "deleting" });
    setError(null);
    setNotice(null);
    const outcome = await deleteForGood(item.id);
    if (outcome.ok) {
      leave(item.id);
      setNotice(`${item.filename} was deleted for good.`);
      return;
    }
    setPending({ id: item.id, kind: "confirming" });
    setError({ id: item.id, message: outcome.message });
  }

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100">
          {notice}{" "}
          {notice.endsWith("restored.") && (
            <Link href="/dashboard/documents" className="font-medium underline underline-offset-4">
              Open Documents
            </Link>
          )}
        </p>
      )}

      {items.length === 0 ? (
        <section aria-label="The bin is empty" className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <p className="font-heading text-xl font-semibold text-foreground">The bin is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">A document you delete stays here for 7 days, so you can bring it back.</p>
        </section>
      ) : (
        <ul aria-label="Documents in the bin" className="flex flex-col gap-2">
          {items.map((item) => {
            const state = pending?.id === item.id ? pending.kind : null;
            const failed = error?.id === item.id ? error.message : null;
            return (
              <li key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <DocTypeIcon type={item.doc_type} className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{item.filename}</span>
                      <span className="block text-xs text-muted-foreground">
                        {DOC_TYPE_LABELS[item.doc_type] ?? item.doc_type} · {deletedText(item.deleted_at)}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        isRunningOut(item.days_left) ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {daysLeftText(item.days_left)}
                    </span>
                    {state !== "confirming" && state !== "deleting" && (
                      <>
                        <Button type="button" variant="outline" size="sm" disabled={state === "restoring"} aria-label={`Restore ${item.filename}`} onClick={() => void restore(item)}>
                          {state === "restoring" ? "Restoring..." : "Restore"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={state === "restoring"}
                          aria-label={`Delete forever: ${item.filename}`}
                          onClick={() => {
                            setError(null);
                            setPending({ id: item.id, kind: "confirming" });
                          }}
                        >
                          Delete forever
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {(state === "confirming" || state === "deleting") && (
                  <div
                    role="group"
                    aria-label={`Delete ${item.filename} for good`}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && state === "confirming") setPending(null);
                    }}
                    className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">Delete &ldquo;{item.filename}&rdquo; for good?</p>
                    <p className="mt-1 text-sm text-muted-foreground">This removes the file and everything Brief read from it. It can&apos;t be undone.</p>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button ref={cancel} type="button" variant="outline" size="sm" autoFocus disabled={state === "deleting"} onClick={() => setPending(null)}>
                        Cancel
                      </Button>
                      <Button type="button" variant="destructive" size="sm" disabled={state === "deleting"} onClick={() => void removeForGood(item)}>
                        {state === "deleting" ? "Deleting..." : "Delete forever"}
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
      )}
    </div>
  );
}
