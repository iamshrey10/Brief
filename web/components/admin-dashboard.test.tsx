// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminStats } from "@/lib/admin";
import { AdminDashboard } from "./admin-dashboard";

afterEach(cleanup);

const stats: AdminStats = {
  generated_at: "2026-11-12T22:00:00Z",
  people: { total: 12, new_7_days: 5, new_30_days: 11, active_today: 3, active_7_days: 7, active_30_days: 10 },
  time_in_brief: { average_minutes_per_person_per_day_7_days: 6.5, average_minutes_per_visit_7_days: 3.2, visits_7_days: 40 },
  documents: { stored: 30, uploaded_7_days: 9, uploaded_30_days: 28, by_kind: { lease: 20, loan: 10 }, by_status: { ready: 28, failed: 2 }, photos: 4, pdfs_and_other: 26 },
  questions: { asked_total: 210, asked_today: 14, asked_7_days: 96 },
  reads: { total: 40, today: 3 },
  overviews: { total: 31, today: 2 },
  reasons: { lease: 6, loan: 3, not_said: 3 },
  sharing: { waiting_or_active: 3, active: 1 },
  site: { model_calls_today: 120, daily_limit: 3000 },
  by_day: [
    { day: "2026-11-10", signed_up: 1, people: 2, minutes: 10 },
    { day: "2026-11-11", signed_up: 0, people: 0, minutes: 0 },
    { day: "2026-11-12", signed_up: 2, people: 4, minutes: 31.5 },
  ],
};

const section = (name: string) => screen.getByRole("region", { name });

describe("the admin dashboard", () => {
  it("has a section for each thing worth knowing", () => {
    render(<AdminDashboard stats={stats} />);

    for (const name of ["People", "Time in Brief", "Documents", "Questions, reads and overviews", "Why people came", "Sharing", "The AI today"]) {
      expect(section(name)).toBeInTheDocument();
    }
  });

  it("shows how many people signed up and were active", () => {
    render(<AdminDashboard stats={stats} />);

    const people = within(section("People"));
    expect(people.getByText("Signed up").nextElementSibling).toHaveTextContent("12");
    expect(people.getByText("New this week").nextElementSibling).toHaveTextContent("5");
    expect(people.getByText("Active today").nextElementSibling).toHaveTextContent("3");
    expect(people.getByText("Active this week").nextElementSibling).toHaveTextContent("7");
    expect(people.getByText("11 in 30 days")).toBeInTheDocument();
  });

  it("shows how long people stay", () => {
    render(<AdminDashboard stats={stats} />);

    const time = within(section("Time in Brief"));
    expect(time.getByText("Average visit").nextElementSibling).toHaveTextContent("3.2 min");
    expect(time.getByText("Per person, per day").nextElementSibling).toHaveTextContent("6.5 min");
    expect(time.getByText("Visits").nextElementSibling).toHaveTextContent("40");
  });

  it("shows the documents, by kind and by state, with plain names", () => {
    render(<AdminDashboard stats={stats} />);

    const documents = within(section("Documents"));
    expect(documents.getByText("Stored now").nextElementSibling).toHaveTextContent("30");
    const kinds = within(documents.getByRole("list", { name: "Documents by kind" }));
    expect(kinds.getByText("Leases")).toBeInTheDocument();
    expect(kinds.getByText("Education loans")).toBeInTheDocument();
    expect(within(documents.getByRole("list", { name: "Documents by state" })).getByText("Failed")).toBeInTheDocument();
  });

  it("shows how many questions were asked", () => {
    render(<AdminDashboard stats={stats} />);

    const questions = within(section("Questions, reads and overviews"));
    expect(questions.getByText("Questions asked").nextElementSibling).toHaveTextContent("210");
    expect(questions.getByText("14 today · 96 this week")).toBeInTheDocument();
  });

  it("shows why people came, biggest first, with the share of the whole", () => {
    render(<AdminDashboard stats={stats} />);

    const reasons = within(section("Why people came")).getByRole("list", { name: "Why people came" });
    const rows = within(reasons).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Check a lease");
    expect(rows[0]).toHaveTextContent("6 · 50%");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("Check a lease"), expect.stringContaining("Understand a loan"), expect.stringContaining("Did not say")]);
  });

  it("shows the day by day charts, with every day available to a screen reader as a table", () => {
    render(<AdminDashboard stats={stats} />);

    const people = within(section("People"));
    expect(people.getByRole("table", { name: "People active each day" })).toBeInTheDocument();
    const rows = within(people.getByRole("table", { name: "People active each day" })).getAllByRole("row");
    expect(rows).toHaveLength(4); // the header and three days
    expect(within(rows[3]).getByRole("rowheader")).toHaveTextContent("Nov 12");
    expect(within(rows[3]).getByRole("cell")).toHaveTextContent("4");
    expect(people.getByText("(6 in 3 days)")).toBeInTheDocument();
  });

  it("shows how much of today's AI limit has been used", () => {
    render(<AdminDashboard stats={stats} />);

    const model = within(section("The AI today"));
    expect(model.getByText("120")).toBeInTheDocument();
    expect(model.getByText(/of 3000 calls/)).toBeInTheDocument();
    expect(model.getByRole("progressbar", { name: "Share of today's limit used" })).toHaveAttribute("aria-valuenow", "4");
  });

  it("separates who can view now from who is only invited", () => {
    render(<AdminDashboard stats={stats} />);

    const sharing = within(section("Sharing"));
    expect(sharing.getByText("Can view now").nextElementSibling).toHaveTextContent("1");
    expect(sharing.getByText("Invited or waiting").nextElementSibling).toHaveTextContent("2");
  });

  it("says so, plainly, when there is nothing to show yet, and does not break", () => {
    render(
      <AdminDashboard
        stats={{ ...stats, documents: { ...stats.documents, stored: 0, by_kind: {}, by_status: {} }, reasons: {}, by_day: [], site: { model_calls_today: 0, daily_limit: 0 } }}
      />,
    );

    expect(screen.getByText("Nobody has signed up yet.")).toBeInTheDocument();
    expect(screen.getAllByText("No documents yet.")).toHaveLength(2);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("has no name, address or document anywhere on it", () => {
    const { container } = render(<AdminDashboard stats={stats} />);

    expect(container.textContent).not.toMatch(/@|\.pdf|\.jpg/i);
  });
});
