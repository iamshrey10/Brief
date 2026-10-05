"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { ClauseViewer } from "@/components/clause-viewer";
import { OverviewPanel } from "@/components/overview-panel";
import type { ActiveCitation, ClauseData } from "@/lib/documents";
import { cn } from "@/lib/utils";

type Tab = "overview" | "ask";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ask", label: "Ask" },
];

export function DocumentWorkspace({
  documentId,
  clauses,
}: {
  documentId: string;
  clauses: ClauseData[];
}) {
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const tabButtons = useRef<Record<Tab, HTMLButtonElement | null>>({ overview: null, ask: null });

  // A new object every time, so choosing the same evidence again scrolls again.
  function showInDocument(citation: ActiveCitation) {
    setActiveCitation({ clauseId: citation.clauseId, quote: citation.quote });
  }

  // Two tabs, so either arrow key moves to the other one, the way a tab list is expected to.
  function handleTabKeys(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Tab = tab === "overview" ? "ask" : "overview";
    setTab(next);
    tabButtons.current[next]?.focus();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="flex max-h-[80vh] min-h-[28rem] flex-col gap-3 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:max-h-none">
        <div
          role="tablist"
          aria-label="Document tools"
          onKeyDown={handleTabKeys}
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              ref={(element) => {
                tabButtons.current[id] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted and one is hidden, so switching tabs never loses the
            conversation or makes the overview read the document again. */}
        <div
          role="tabpanel"
          id="panel-overview"
          aria-labelledby="tab-overview"
          hidden={tab !== "overview"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverviewPanel documentId={documentId} onCitationSelect={showInDocument} />
        </div>
        <div
          role="tabpanel"
          id="panel-ask"
          aria-labelledby="tab-ask"
          hidden={tab !== "ask"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ChatPanel
            documentId={documentId}
            onCitationSelect={(citation) =>
              showInDocument({ clauseId: citation.clause_id, quote: citation.quote })
            }
          />
        </div>
      </div>
      <ClauseViewer clauses={clauses} activeCitation={activeCitation} />
    </div>
  );
}
