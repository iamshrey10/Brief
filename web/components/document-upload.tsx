"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

type DocumentSummary = {
  id: string;
  filename: string;
  doc_type: string;
  status: string;
};

const DOC_TYPES = [
  { value: "loan", label: "Education loan" },
  { value: "lease", label: "Lease" },
  { value: "offer", label: "Job offer" },
  { value: "other", label: "Other" },
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type Status = "idle" | "uploading" | "error";

export function DocumentUpload({ initialDocuments }: { initialDocuments: DocumentSummary[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("loan");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [documents, setDocuments] = useState(initialDocuments);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage("That file is larger than the 50MB limit.");
      return;
    }

    setStatus("uploading");
    setErrorMessage("");

    try {
      const createRes = await fetch("/api/backend/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          doc_type: docType,
          content_type: file.type || "application/pdf",
          file_size_bytes: file.size,
        }),
      });
      if (!createRes.ok) throw new Error("could not start the upload");
      const { document_id, upload_url } = await createRes.json();

      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("the file upload failed");

      const confirmRes = await fetch(`/api/backend/documents/${document_id}/confirm`, {
        method: "PATCH",
      });
      if (!confirmRes.ok) throw new Error("could not confirm the upload");
      const confirmed: DocumentSummary = await confirmRes.json();

      setDocuments((prev) => [confirmed, ...prev]);
      setFile(null);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <label className="text-sm font-medium text-foreground">
          Document
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </label>

        <label className="text-sm font-medium text-foreground">
          Type
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" disabled={!file || status === "uploading"}>
          {status === "uploading" ? "Uploading..." : "Upload"}
        </Button>

        {status === "error" && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>

      {documents.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Your documents</h2>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="text-foreground">{doc.filename}</span>
              <span className="text-xs text-muted-foreground">{doc.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
