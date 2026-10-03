"use client";

import { ChatPanel } from "@/components/chat-panel";
import { ClauseViewer } from "@/components/clause-viewer";
import type { ClauseData } from "@/lib/documents";

export function DocumentWorkspace({
  documentId,
  clauses,
}: {
  documentId: string;
  clauses: ClauseData[];
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <ChatPanel documentId={documentId} />
      <ClauseViewer clauses={clauses} />
    </div>
  );
}
