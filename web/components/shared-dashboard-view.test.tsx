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
  owner_name: null,
  documents: [
    { id: "d1", filename: "maple-lease.pdf", doc_type: "lease", status: "ready", ocr_confidence: null, created_at: "2026-10-30T10:00:00Z", status_changed_at: "2026-10-30T10:01:00Z", key_terms: [{ label: "Monthly rent", value: "$1,800 a month" }, { label: "Security deposit", value: "One month's rent" }] },
    { id: "d2", filename: "loan.pdf", doc_type: "loan", status: "failed", ocr_confidence: null, created_at: "2026-10-31T10:00:00Z", status_changed_at: "2026-10-31T10:01:00Z", key_terms: [] },
  ],
  insights: [{ document_id: "d1", terms_found: 4, terms_total: 6, questions_answered: 3, open_count: 2, open_questions: ["Can the landlord raise the rent mid-lease?"] }],
  key_dates: [{ document_id: "d1", field: "lease_end", label: "Lease ends", value: "November 13, 2026" }],
};

describe("a shared dashboard", () => {
  it("says whose it is and that it is read only", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.getByRole("note")).toHaveTextContent("owner@example.com");
    expect(screen.getByRole("note")).toHaveTextContent("shared their dashboard with you");
    expect(screen.getByRole("note")).toHaveTextContent("Read only");
  });

  it("names the owner by their name, with the address beneath, when they gave one", () => {
    render(<SharedDashboardView shared={{ ...shared, owner_name: "Maya Rao" }} now={NOW} />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Maya Rao");
    expect(note).toHaveTextContent("owner@example.com");
    expect(note).toHaveTextContent("M");
  });

  it("falls back to the address when the owner has not given a name", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.getByRole("note")).toHaveTextContent("owner@example.com");
  });

  it("shows what kinds of document there are", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    const kinds = screen.getByRole("region", { name: "What is here" });
    expect(kinds).toHaveTextContent("Lease1");
    expect(kinds).toHaveTextContent("Education loan1");
  });

  it("shows the counts and the lease time left", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.getByRole("region", { name: "Your documents at a glance" })).toHaveTextContent("2");
    expect(screen.getByRole("region", { name: "Lease remaining" })).toHaveTextContent("10 days left");
  });

  it("lists the important dates with how far away each is", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    const dates = screen.getByRole("region", { name: "Important dates" });
    expect(dates).toHaveTextContent("Lease ends");
    expect(dates).toHaveTextContent("November 13, 2026");
    expect(dates).toHaveTextContent("In 10 days");
  });

  it("lists what needs attention, and says so when nothing does", () => {
    const { rerender } = render(<SharedDashboardView shared={shared} now={NOW} />);

    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(attention).toHaveTextContent("Could not be read");
    expect(attention).toHaveTextContent("loan.pdf");
    expect(attention).toHaveTextContent("2 things still to ask");

    rerender(<SharedDashboardView shared={{ ...shared, documents: [shared.documents[0]], insights: [] }} now={NOW} />);
    expect(screen.getByRole("region", { name: "Needs attention" })).toHaveTextContent("Nothing needs attention.");
  });

  it("gives each document its own card: kind, state, its dates, and each key term with its value", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    const lease = within(screen.getByRole("list", { name: "Shared documents" })).getByRole("heading", { name: "maple-lease.pdf" }).closest("li")!;
    expect(lease).toHaveTextContent("Lease");
    expect(lease).toHaveTextContent("Ready");
    expect(within(lease).getByRole("list", { name: "Dates in maple-lease.pdf" })).toHaveTextContent("Lease ends: November 13, 2026");
    const terms = within(lease).getByText("Monthly rent");
    expect(terms.nextElementSibling).toHaveTextContent("$1,800 a month");
    expect(lease).toHaveTextContent("4 of 6 key terms found");
    expect(lease).toHaveTextContent("Can the landlord raise the rent mid-lease?");
  });

  it("says when a document has no key terms yet", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    const loan = screen.getByRole("heading", { name: "loan.pdf" }).closest("li")!;
    expect(loan).toHaveTextContent("No key terms read yet.");
    expect(loan).toHaveTextContent("Couldn't read");
  });

  it("has nothing that changes anything and no link into the owner's documents", () => {
    render(<SharedDashboardView shared={shared} now={NOW} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says there are no documents, and shows no lease card, when there is nothing", () => {
    render(<SharedDashboardView shared={{ owner_email: "o@x.com", owner_name: null, documents: [], insights: [], key_dates: [] }} now={NOW} />);

    expect(screen.getByText("No documents yet.")).toBeInTheDocument();
    expect(screen.getByText("No dates found yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lease remaining" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What is here" })).not.toBeInTheDocument();
  });
});
