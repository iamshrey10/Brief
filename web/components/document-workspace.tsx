"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { ClauseViewer } from "@/components/clause-viewer";
import type { ActiveCitation, ClauseData } from "@/lib/documents";

export function DocumentWorkspace({
  documentId,
  clauses,
}: {
  documentId: string;
  clauses: ClauseData[];
}) {
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <ChatPanel
        documentId={documentId}
        onCitationSelect={(citation) =>
          // A new object every time, so choosing the same citation again scrolls again.
          setActiveCitation({ clauseId: citation.clause_id, quote: citation.quote })
        }
      />
      <ClauseViewer clauses={clauses} activeCitation={activeCitation} />
    </div>
  );
}
