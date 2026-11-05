"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { CloudUpload, FileText } from "lucide-react";
import { FOLDERS } from "@/lib/folders";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_FILE_TYPES,
  contentTypeFor,
  DOC_TYPE_LABELS,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  type DocumentSummary,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import { startFailureMessage } from "@/lib/upload";

const DOC_TYPES = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

type Status = "idle" | "uploading" | "error";

/** What an upload is doing right now, in words, so a slow moment does not look like a freeze. */
export type UploadStage = "sample" | "preparing" | "sending" | "checking";
export const STAGE_TEXT: Record<UploadStage, string> = {
  sample: "Loading the sample lease...",
  preparing: "Getting ready...",
  sending: "Sending your file...",
  checking: "Checking your file...",
};

/** A made up lease that ships with the site (web/samples), so Brief can be tried without a real contract. */
export const SAMPLE_LEASE_URL = "/samples/sample-lease.pdf";


/**
 * The upload form: choose or drop a file, say what kind it is, send it, or try the sample lease. It is used on the
 * Documents page and on the Dashboard, and tells whoever shows it, through `onUploaded`, when a document has been
 * accepted, so each can do what it needs to (add it to its list, or refresh its numbers).
 */
export function UploadPanel({ onUploaded }: { onUploaded: (document: DocumentSummary) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("loan");
  // Empty means automatic: the folder for the kind.
  const [folder, setFolder] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState<UploadStage>("preparing");
  const [errorMessage, setErrorMessage] = useState("");
  const [dragging, setDragging] = useState(false);

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
    if (!file) return;
    await upload(file, docType);
  }

  // Loads the made up lease that ships with the site and sends it through the very same upload as a chosen file.
  async function trySample() {
    if (status === "uploading") return;
    setStage("sample");
    setStatus("uploading");
    setErrorMessage("");
    try {
      const res = await fetch(SAMPLE_LEASE_URL);
      if (!res.ok) throw new Error("the sample lease could not be loaded");
      const blob = await res.blob();
      await upload(new File([blob], "sample-lease.pdf", { type: "application/pdf" }), "lease");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  async function upload(target: File, kind: string) {
    const contentType = contentTypeFor(target);
    if (!contentType) return;

    setStatus("uploading");
    setStage("preparing");
    setErrorMessage("");

    try {
      const createRes = await fetch("/api/backend/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: target.name,
          doc_type: kind,
          content_type: contentType,
          file_size_bytes: target.size,
          ...(folder ? { folder } : {}),
        }),
      });
      if (!createRes.ok) throw new Error(await startFailureMessage(createRes));
      const { document_id, upload_url } = await createRes.json();

      setStage("sending");
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: target,
      });
      if (!uploadRes.ok) throw new Error("the file upload failed");

      setStage("checking");
      const confirmRes = await fetch(`/api/backend/documents/${document_id}/confirm`, {
        method: "PATCH",
      });
      if (!confirmRes.ok) {
        throw new Error(await startFailureMessage(confirmRes, "could not confirm the upload"));
      }
      const confirmed: DocumentSummary = await confirmRes.json();

      setFile(null);
      setStatus("idle");
      onUploaded(confirmed);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  const uploading = status === "uploading";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
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
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-5 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50",
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

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex flex-col gap-1 md:flex-1">
        <label htmlFor="upload-folder" className="text-sm font-medium text-foreground">
          Folder
        </label>
        <select
          id="upload-folder"
          value={folder}
          disabled={uploading}
          onChange={(event) => setFolder(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Automatic, by kind</option>
          {FOLDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {docType === "other" && !folder && (
          <p className="text-xs text-muted-foreground">Not sure where this belongs, so it goes in Other. Choose a folder to file it somewhere else.</p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={!file || uploading} className="md:w-48">
        {uploading ? "Uploading..." : "Upload"}
      </Button>
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {uploading && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {STAGE_TEXT[stage]}
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        No contract handy?{" "}
        <button
          type="button"
          onClick={() => void trySample()}
          disabled={uploading}
          className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          Try a sample lease
        </button>
      </p>
    </form>
  );
}
