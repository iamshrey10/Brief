// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { SharedDashboard } from "@/lib/sharing";
import { SharedDashboardView } from "./shared-dashboard-view";

afterEach(cleanup);

const NOW = new Date(2026, 10, 3, 12);
const shared: SharedDashboard = {
  owner_email: "owner@example.com",
  documents: [
    { id: "d1", filename: "maple-lease.pdf", doc_type: "lease", status: "ready", ocr_confidence: null, created_at: "2026-10-30T10:00:00Z", status_changed_at: "2026-10-30T10:01:00Z" },
    { id: "d2", filename: "loan.pdf", doc_type: "loan", status: "failed", ocr_confidence: null, created_at: "2026-10-31T10:00:00Z", status_changed_at: "2026-10-31T10:01:00Z" },
  ],
  insights: [{ document_id: "d1", terms_found: 4, terms_total: 6, questions_answered: 3, open_count: 2, open_questions: ["Can the landlord raise the rent mid-lease?"] }],
  key_dates: [{ document_id: "d1", field: "lease_end", label: "Lease ends", value: "November 13, 2026" }],
};

describe("a shared dashboard", () => {
  it("says whose it is and that it is read only", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.getByRole("note")).toHaveTextContent("owner@example.com");
    expect(screen.getByRole("note")).toHaveTextContent("read only");
  });

  it("shows the counts, the lease time left and the dates found", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.getByRole("region", { name: "Your documents at a glance" })).toHaveTextContent("2");
    expect(screen.getByRole("region", { name: "Lease remaining" })).toHaveTextContent("10 days left");
    expect(within(screen.getByRole("region", { name: "Dates found" })).getByText("November 13, 2026")).toBeInTheDocument();
  });

  it("lists each document with its kind, state and what was found, and the questions still open", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    const list = screen.getByRole("list", { name: "Shared documents" });
    const lease = within(list).getByText("maple-lease.pdf").closest("li")!;
    expect(lease).toHaveTextContent("Lease");
    expect(lease).toHaveTextContent("4 of 6 key terms found · 2 still to ask");
    expect(lease).toHaveTextContent("Can the landlord raise the rent mid-lease?");
    expect(within(list).getByText("loan.pdf").closest("li")).toHaveTextContent("Education loan");
  });

  it("has nothing that changes anything and no link into the owner's documents", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/dashboard/documents"))).toHaveLength(0);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says there are no documents, and shows no lease or dates card, when there is nothing", () => {
    render(<SharedDashboardView shared={{ owner_email: "o@x.com", documents: [], insights: [], key_dates: [] }} now={NOW} />);

    expect(screen.getByText("No documents yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lease remaining" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dates found" })).not.toBeInTheDocument();
  });
});
