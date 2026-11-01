"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentList } from "@/components/document-list";
import { UploadPanel } from "@/components/upload-panel";
import {
  isInProgress,
  MAX_POLL_DURATION_MS,
  mergeFresh,
  POLL_INTERVAL_MS,
  putFirst,
  removeDocument,
  replaceDocument,
  type DocumentSummary,
} from "@/lib/documents";

// The sample lease and the upload steps live with the form. They are still importable from here, where they began.
export { SAMPLE_LEASE_URL, STAGE_TEXT, type UploadStage } from "@/components/upload-panel";

// How long a rename is held on to. It only has to outlast a refresh that was already on its way
// when the rename was made, which arrives within seconds. After that the server is believed again.
const RECENT_EDIT_MS = 60_000;

type RecentEdit = { filename: string; doc_type: string; at: number };

export function DocumentUpload({ initialDocuments }: { initialDocuments: DocumentSummary[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
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

  return (
    <div className="flex w-full flex-col gap-8">
      <UploadPanel onUploaded={(confirmed) => setDocuments((previous) => putFirst(previous, confirmed))} />

      <DocumentList
        documents={documents}
        onRetried={(updated) => setDocuments((previous) => replaceDocument(previous, updated))}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
