"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { CloudUpload, FileText } from "lucide-react";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { DocumentList } from "@/components/document-list";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_FILE_TYPES,
  contentTypeFor,
  DOC_TYPE_LABELS,
  formatFileSize,
  isInProgress,
  MAX_FILE_SIZE_BYTES,
  MAX_POLL_DURATION_MS,
  mergeFresh,
  POLL_INTERVAL_MS,
  putFirst,
  removeDocument,
  replaceDocument,
  type DocumentSummary,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import { startFailureMessage } from "@/lib/upload";

const DOC_TYPES = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// How long a rename is held on to. It only has to outlast a refresh that was already on its way
// when the rename was made, which arrives within seconds. After that the server is believed again.
const RECENT_EDIT_MS = 60_000;

type RecentEdit = { filename: string; doc_type: string; at: number };

type Status = "idle" | "uploading" | "error";

export function DocumentUpload({ initialDocuments }: { initialDocuments: DocumentSummary[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("loan");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [documents, setDocuments] = useState(initialDocuments);
  const [dragging, setDragging] = useState(false);
  // A refresh that began before a delete or a rename can come back showing the old state. These
  // remember what was just done here, so that cannot bring a deleted document back or undo a rename.
  const deletedIds = useRef(new Set<string>());
  const recentEdits = useRef(new Map<string, RecentEdit>());

  function applyLocalChanges(list: DocumentSummary[]): DocumentSummary[] {
    const now = Date.now();
    return list
      .filter((document) => !deletedIds.current.has(document.id))
      .map((document) => {
        const edit = recentEdits.current.get(document.id);
        if (!edit || now - edit.at >= RECENT_EDIT_MS) return document;
        return { ...document, filename: edit.filename, doc_type: edit.doc_type };
      });
  }

  function handleUpdated(updated: DocumentSummary) {
    recentEdits.current.set(updated.id, {
      filename: updated.filename,
      doc_type: updated.doc_type,
      at: Date.now(),
    });
    setDocuments((previous) => replaceDocument(previous, updated));
  }

  function handleDeleted(id: string) {
    deletedIds.current.add(id);
    recentEdits.current.delete(id);
    setDocuments((previous) => removeDocument(previous, id));
  }

  const hasInProgress = documents.some((doc) => isInProgress(doc.status));

  // A finished upload is only "processing" for a moment, so while anything is, re-check the
  // list and let it flip to ready by itself. Depends on the boolean and the count, not the
  // list itself, so a fresh list from each check doesn't restart the timer, but a new upload
  // does.
  useEffect(() => {
    if (!hasInProgress) return;

    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt >= MAX_POLL_DURATION_MS) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch("/api/backend/documents");
        if (res.ok) {
          const fresh: DocumentSummary[] = await res.json();
          setDocuments((previous) => applyLocalChanges(mergeFresh(previous, fresh)));
        }
      } catch {
        // Network blip, the next tick tries again.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hasInProgress, documents.length]);

  // Checked as soon as a file is chosen or dropped, so a wrong file is turned away on the spot
  // rather than after a click on Upload. The file picker's own filter does not apply to a drop.
  function chooseFile(candidate: File | null | undefined) {
    if (!candidate) return;

    if (contentTypeFor(candidate) === null) {
      setStatus("error");
      setErrorMessage("That kind of file isn't supported. Use a PDF, JPG, PNG, or HEIC.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage("That file is larger than the 50 MB limit.");
      return;
    }

    setFile(candidate);
    setStatus("idle");
    setErrorMessage("");
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const contentType = file ? contentTypeFor(file) : null;
    if (!file || !contentType) return;

    setStatus("uploading");
    setErrorMessage("");

    try {
      const createRes = await fetch("/api/backend/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          doc_type: docType,
          content_type: contentType,
          file_size_bytes: file.size,
        }),
      });
      if (!createRes.ok) throw new Error(await startFailureMessage(createRes));
      const { document_id, upload_url } = await createRes.json();

      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("the file upload failed");

      const confirmRes = await fetch(`/api/backend/documents/${document_id}/confirm`, {
        method: "PATCH",
      });
      if (!confirmRes.ok) throw new Error("could not confirm the upload");
      const confirmed: DocumentSummary = await confirmRes.json();

      setDocuments((previous) => putFirst(previous, confirmed));
      setFile(null);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  const uploading = status === "uploading";

  return (
    <div className="flex w-full flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5"
      >
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
            >
              <FileText className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{file.name}</span>
              <span className="block text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              aria-label={`Remove ${file.name}`}
              onClick={() => setFile(null)}
            >
              Remove
            </Button>
          </div>
        ) : (
          <label
            onDragOver={handleDragOver}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50",
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
            )}
          >
            <CloudUpload aria-hidden className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Drop a contract here, or <span className="text-primary underline">choose a file</span>
            </span>
            <span className="text-xs text-muted-foreground">PDF, JPG, PNG, or HEIC, up to 50 MB</span>
            <input
              type="file"
              accept={ACCEPTED_FILE_TYPES.join(",")}
              aria-label="Choose a file to upload"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              className="sr-only"
            />
          </label>
        )}

        <fieldset disabled={uploading} className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            What kind of document is it?
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DOC_TYPES.map((type) => (
              <label key={type.value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="doc-type"
                  value={type.value}
                  checked={docType === type.value}
                  onChange={() => setDocType(type.value)}
                  className="peer sr-only"
                />
                <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50 hover:bg-accent">
                  <DocTypeIcon type={type.value} className="size-4 shrink-0" />
                  {type.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <Button type="submit" size="lg" disabled={!file || uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </Button>
      </form>

      <DocumentList
        documents={documents}
        onRetried={(updated) => setDocuments((previous) => replaceDocument(previous, updated))}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
