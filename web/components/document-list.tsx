"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CircleCheck,
  CircleX,
  LoaderCircle,
  Pencil,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteDocument, MAX_FILENAME_LENGTH, updateDocument } from "@/lib/document-actions";
import { retryDocument } from "@/lib/retry";
import { rereadDocument } from "@/lib/reread";
import {
  canRetry,
  DOC_TYPE_LABELS,
  failureMessage,
  formatUploaded,
  isReadable,
  progressLabel,
  statusLabel,
  type DocumentSummary,
} from "@/lib/documents";

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

  if (status === "ready") {
    return (
      <span className={cn(base, "bg-primary/10 text-primary")}>
        <CircleCheck aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  }
  if (status === "needs_retake") {
    return (
      <span
        className={cn(
          base,
          "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
        )}
      >
        <TriangleAlert aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={cn(base, "bg-destructive/10 text-destructive")}>
        <CircleX aria-hidden className="size-3.5" />
        {label}
      </span>
    );
  }
  // pending, uploaded, processing: still working on it.
  return (
    <span className={cn(base, "bg-muted text-muted-foreground")}>
      <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
      {label}
    </span>
  );
}

type Mode = "view" | "edit" | "delete" | "reread";

/** Runs `onCancel` when Escape is pressed, so a form or a question can always be backed out of. */
function cancelOnEscape(event: KeyboardEvent, onCancel: () => void, busy: boolean) {
  if (event.key === "Escape" && !busy) {
    event.preventDefault();
    onCancel();
  }
}

function EditForm({
  doc,
  onCancel,
  onSaved,
}: {
  doc: DocumentSummary;
  onCancel: () => void;
  onSaved: (document: DocumentSummary) => void;
}) {
  const [name, setName] = useState(doc.filename);
  const [kind, setKind] = useState(doc.doc_type);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  // The Edit button that was pressed is replaced by this form, so focus has to be placed here, or
  // it falls back to the page and keys like Escape reach nothing.
  useEffect(() => {
    nameInput.current?.focus();
    nameInput.current?.select();
  }, []);

  const trimmed = name.trim();
  const nameChanged = trimmed !== doc.filename;
  const kindChanged = kind !== doc.doc_type;
  const nameOk = trimmed.length > 0 && trimmed.length <= MAX_FILENAME_LENGTH;
  const canSave = nameOk && (nameChanged || kindChanged) && !saving;

  // The kinds Brief knows, plus the document's own if it is one that is no longer offered.
  const kinds = Object.entries(DOC_TYPE_LABELS);
  if (!(doc.doc_type in DOC_TYPE_LABELS)) kinds.push([doc.doc_type, doc.doc_type]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);
    const changes: { filename?: string; doc_type?: string } = {};
    if (nameChanged) changes.filename = trimmed;
    if (kindChanged) changes.doc_type = kind;

    const outcome = await updateDocument(doc.id, changes);
    setSaving(false);
    if (outcome.ok) onSaved(outcome.result);
    else setError(outcome.message);
  }

  return (
    <form
      onSubmit={save}
      onKeyDown={(event) => cancelOnEscape(event, onCancel, saving)}
      aria-label={`Edit ${doc.filename}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Name
          <input
            ref={nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_FILENAME_LENGTH}
            disabled={saving}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            disabled={saving}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {kinds.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {trimmed.length === 0 && (
        <p className="text-xs text-muted-foreground">A name can&apos;t be empty.</p>
      )}
      {kindChanged && (
        <p className="text-xs text-muted-foreground">
          Changing the kind clears this document&apos;s saved key terms and questions. They are
          worked out again for the new kind.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSave}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function ConfirmDelete({
  doc,
  onCancel,
  onDeleted,
}: {
  doc: DocumentSummary;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  // Focus starts on Cancel, so a stray Enter can never delete anything.
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  async function confirm() {
    setDeleting(true);
    setError(null);
    const outcome = await deleteDocument(doc.id);
    if (outcome.ok) {
      onDeleted(doc.id);
      return;
    }
    setDeleting(false);
    setError(outcome.message);
  }

  return (
    <div
      role="group"
      aria-label={`Delete ${doc.filename}`}
      onKeyDown={(event) => cancelOnEscape(event, onCancel, deleting)}
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <p className="text-sm font-medium text-foreground">Delete &ldquo;{doc.filename}&rdquo;?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This removes the file and everything Brief read from it. It can&apos;t be undone.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          ref={cancelButton}
          type="button"
          variant="outline"
          size="sm"
          disabled={deleting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={confirm}>
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function ConfirmReread({
  doc,
  onCancel,
  onStarted,
}: {
  doc: DocumentSummary;
  onCancel: () => void;
  onStarted: (document: DocumentSummary) => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  // Focus starts on Cancel, so a stray Enter cannot start a fresh read by accident.
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  async function confirm() {
    setStarting(true);
    setError(null);
    const outcome = await rereadDocument(doc.id);
    if (outcome.ok) {
      onStarted(outcome.document);
      return;
    }
    setStarting(false);
    setError(outcome.message);
  }

  return (
    <div
      role="group"
      aria-label={`Read ${doc.filename} again`}
      onKeyDown={(event) => cancelOnEscape(event, onCancel, starting)}
      className="rounded-lg border border-border bg-card px-4 py-3"
    >
      <p className="text-sm font-medium text-foreground">Read &ldquo;{doc.filename}&rdquo; again?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This replaces what Brief read before, including its key terms and questions. Reading takes
        a little while.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          ref={cancelButton}
          type="button"
          variant="outline"
          size="sm"
          disabled={starting}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={starting} onClick={confirm}>
          {starting ? "Starting..." : "Read again"}
        </Button>
      </div>
    </div>
  );
}

function DocumentRow({
  doc,
  onRetried,
  onUpdated,
  onDeleted,
}: {
  doc: DocumentSummary;
  onRetried?: (document: DocumentSummary) => void;
  onUpdated?: (document: DocumentSummary) => void;
  onDeleted?: (id: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const rereadButton = useRef<HTMLButtonElement>(null);
  const cameFrom = useRef<Mode>("view");

  // Closing the form or the question puts focus back on the button that opened it, so someone using
  // the keyboard is not sent back to the top of the page.
  useEffect(() => {
    if (mode !== "view") return;
    if (cameFrom.current === "edit") editButton.current?.focus();
    if (cameFrom.current === "delete") deleteButton.current?.focus();
    if (cameFrom.current === "reread") rereadButton.current?.focus();
    cameFrom.current = "view";
  }, [mode]);

  function show(next: Mode) {
    if (next === "view") cameFrom.current = mode;
    setMode(next);
  }

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    const outcome = await retryDocument(doc.id);
    setRetrying(false);
    if (outcome.ok) onRetried?.(outcome.document);
    else setRetryError(outcome.message);
  }

  if (mode === "edit") {
    return (
      <EditForm
        doc={doc}
        onCancel={() => show("view")}
        onSaved={(updated) => {
          show("view");
          onUpdated?.(updated);
        }}
      />
    );
  }
  if (mode === "reread") {
    return (
      <ConfirmReread
        doc={doc}
        onCancel={() => show("view")}
        onStarted={(updated) => {
          show("view");
          onRetried?.(updated);
        }}
      />
    );
  }
  if (mode === "delete") {
    return (
      <ConfirmDelete
        doc={doc}
        onCancel={() => show("view")}
        onDeleted={(id) => onDeleted?.(id)}
      />
    );
  }

  const uploaded = formatUploaded(doc.created_at);
  const typeLabel = DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type;
  // Only a document that has clauses to show gets a link, anything else would open an empty page.
  const readable = isReadable(doc.status);
  const failure = failureMessage(doc);
  const progress = progressLabel(doc);

  const main = (
    <>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
      >
        <DocTypeIcon type={doc.doc_type} className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{doc.filename}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {typeLabel}
          {uploaded && ` · Uploaded ${uploaded}`}
        </span>
        {progress && <span className="mt-0.5 block text-xs text-muted-foreground">{progress}</span>}
        {failure && <span className="mt-0.5 block text-xs text-muted-foreground">{failure}</span>}
        {retryError && (
          <span role="alert" className="mt-0.5 block text-xs text-destructive">
            {retryError}
          </span>
        )}
      </span>
      <StatusBadge status={doc.status} />
      {readable && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
    </>
  );

  // The actions sit beside the link, not inside it: a button inside a link is not valid, and
  // pressing one must never also open the document.
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card pr-2">
      {readable ? (
        <Link
          href={`/dashboard/documents/${doc.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-4 py-3 transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {main}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">{main}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {canRetry(doc) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={retrying}
            aria-label={`Try reading ${doc.filename} again`}
            onClick={retry}
          >
            {retrying ? "Starting..." : "Try again"}
          </Button>
        )}
        {readable && (
          <Button
            ref={rereadButton}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Read ${doc.filename} again`}
            title="Read again"
            onClick={() => show("reread")}
          >
            <RotateCw aria-hidden />
          </Button>
        )}
        <Button
          ref={editButton}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${doc.filename}`}
          title="Rename or change the kind"
          onClick={() => show("edit")}
        >
          <Pencil aria-hidden />
        </Button>
        <Button
          ref={deleteButton}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${doc.filename}`}
          title="Delete"
          onClick={() => show("delete")}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function DocumentList({
  documents,
  onRetried,
  onUpdated,
  onDeleted,
}: {
  documents: DocumentSummary[];
  onRetried?: (document: DocumentSummary) => void;
  onUpdated?: (document: DocumentSummary) => void;
  onDeleted?: (id: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a loan, lease, or job offer above and Brief will explain it clause by clause.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Your documents" className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">Your documents</h2>
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <li key={doc.id}>
            <DocumentRow
              doc={doc}
              onRetried={onRetried}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
