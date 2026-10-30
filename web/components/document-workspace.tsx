"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { ClauseViewer } from "@/components/clause-viewer";
import { OverviewPanel } from "@/components/overview-panel";
import type { ActiveCitation, ClauseData } from "@/lib/documents";
import { cn } from "@/lib/utils";

type Tab = "overview" | "ask";

/** Small line icons for the tabs. They are decoration, so a screen reader hears only the tab's name. */
function TabIcon({ tab }: { tab: Tab }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tab === "overview" ? (
        <path d="M4 6h16M4 12h10M4 18h7" />
      ) : (
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      )}
    </svg>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ask", label: "Ask" },
];

export function DocumentWorkspace({
  documentId,
  filename,
  docType,
  clauses,
}: {
  documentId: string;
  filename: string;
  docType?: string;
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
    <div className="grid items-start gap-6 lg:grid-cols-2 print:block">
      <div className="flex max-h-[80vh] min-h-[28rem] flex-col gap-3 lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)] lg:max-h-none print:static print:h-auto print:max-h-none">
        <div
          role="tablist"
          aria-label="Document tools"
          onKeyDown={handleTabKeys}
          className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1 print:hidden"
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
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                tab === id
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              <span className={tab === id ? "text-primary" : undefined}>
                <TabIcon tab={id} />
              </span>
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
          <OverviewPanel documentId={documentId} filename={filename} onCitationSelect={showInDocument} />
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
            docType={docType}
            onCitationSelect={(citation) =>
              showInDocument({ clauseId: citation.clause_id, quote: citation.quote })
            }
          />
        </div>
      </div>
      <div className="print:hidden">
        <ClauseViewer clauses={clauses} activeCitation={activeCitation} />
      </div>
    </div>
  );
}
