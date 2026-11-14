// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminDay, AdminPeriod, AdminStats } from "@/lib/admin";
import { AdminDashboard } from "./admin-dashboard";

afterEach(cleanup);

const day = (label: string, fields: Partial<AdminDay> = {}): AdminDay => ({ day: label, signed_up: 0, people: 0, visits: 0, minutes: 0, documents: 0, questions: 0, reads: 0, overviews: 0, demo_opened: 0, demo_finished: 0, ...fields });
const period = (fields: Partial<AdminPeriod> = {}): AdminPeriod => ({ signed_up: 3, people: 5, visits: 9, minutes: 41.5, documents: 6, questions: 22, reads: 4, overviews: 3, demo_opened: 11, demo_finished: 4, average_minutes_per_visit: 4.6, ...fields });

const stats: AdminStats = {
  generated_at: "2026-11-12T22:00:00Z",
  range_days: 30,
  people: { total: 12, new_7_days: 5, new_30_days: 11, active_today: 3, active_7_days: 7, active_30_days: 10 },
  time_in_brief: { average_minutes_per_person_per_day_7_days: 6.5, average_minutes_per_visit_7_days: 3.2, visits_7_days: 40 },
  documents: { stored: 30, uploaded_7_days: 9, uploaded_30_days: 28, by_kind: { lease: 20, loan: 10 }, by_status: { ready: 28, failed: 2 }, photos: 4, pdfs_and_other: 26 },
  questions: { asked_total: 210, asked_today: 14, asked_7_days: 96 },
  reads: { total: 40, today: 3 },
  overviews: { total: 31, today: 2 },
  reasons: { lease: 6, loan: 3, not_said: 3 },
  sharing: { waiting_or_active: 3, active: 1 },
  site: { model_calls_today: 120, daily_limit: 3000 },
  funnel: { signed_up: 12, uploaded_a_document: 9, asked_a_question: 7, came_back_another_day: 4, shared_their_dashboard: 2 },
  demo: { opened_total: 48, finished_total: 19, opened_7_days: 12, finished_7_days: 5, opened_30_days: 40, finished_30_days: 16 },
  period: { current: period({ signed_up: 6, minutes: 90, demo_opened: 11 }), previous: period({ signed_up: 4, minutes: 90, demo_opened: 0 }) },
  by_day: [day("2026-11-10", { signed_up: 1, people: 2, minutes: 10 }), day("2026-11-11"), day("2026-11-12", { signed_up: 2, people: 4, minutes: 31.5, demo_opened: 3 })],
};

const section = (name: string) => screen.getByRole("region", { name });

describe("the admin dashboard", () => {
  it("has a section for each thing worth knowing", () => {
    render(<AdminDashboard stats={stats} />);

    for (const name of ["Activity over time", "How far people get", "Why people came", "The demo video", "People", "Documents", "Questions, reads and overviews", "Sharing", "The AI today", "Download a report"]) {
      expect(section(name)).toBeInTheDocument();
    }
  });

  it("opens with the chosen stretch at a glance: six numbers, each against the stretch before", () => {
    render(<AdminDashboard stats={stats} />);

    const glance = within(screen.getByLabelText("The last 30 days"));
    for (const [label, value] of [["New people", "6"], ["Active people", "5"], ["Documents uploaded", "6"], ["Questions asked", "22"], ["Time in Brief", "1 h 30 min"], ["Demo video opened", "11"]]) {
      expect(glance.getByText(label).nextElementSibling).toHaveTextContent(value);
    }
  });

  it("says how each number moved, in words and not only in colour", () => {
    render(<AdminDashboard stats={stats} />);

    const glance = within(screen.getByLabelText("The last 30 days"));
    expect(glance.getByText("+50%")).toBeInTheDocument(); // new people, 6 against 4
    expect(glance.getByText("New")).toBeInTheDocument(); // the demo, 11 against none before
    expect(glance.getAllByText("No change").length).toBeGreaterThan(0); // minutes, 90 against 90
    expect(glance.getAllByText("vs the 30 days before").length).toBe(6);
  });

  it("offers 7, 30 and 90 days as links, and marks the one shown", () => {
    render(<AdminDashboard stats={stats} />);

    const choices = within(screen.getByRole("navigation", { name: "How far back to look" }));
    expect(choices.getByRole("link", { name: "7 days" })).toHaveAttribute("href", "/dashboard/admin?days=7");
    expect(choices.getByRole("link", { name: "90 days" })).toHaveAttribute("href", "/dashboard/admin?days=90");
    expect(choices.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
    expect(choices.getByRole("link", { name: "7 days" })).not.toHaveAttribute("aria-current");
  });

  it("follows the chosen stretch in its words", () => {
    render(<AdminDashboard stats={{ ...stats, range_days: 90 }} />);

    expect(screen.getByLabelText("The last 90 days")).toBeInTheDocument();
    expect(screen.getAllByText("vs the 90 days before").length).toBe(6);
  });

  it("shows how far people get, each step with its share of the one before", () => {
    render(<AdminDashboard stats={stats} />);

    const steps = within(within(section("How far people get")).getByRole("list", { name: "How far people get" })).getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent("Signed up12");
    expect(steps[1]).toHaveTextContent("Uploaded a document9 · 75% of the step before");
    expect(steps[4]).toHaveTextContent("Shared their dashboard2 · 50% of the step before");
  });

  it("shows the demo video: opened, watched to the end, and the share who finished", () => {
    render(<AdminDashboard stats={stats} />);

    const demo = within(section("The demo video"));
    expect(demo.getAllByText("Opened")[0].nextElementSibling).toHaveTextContent("48");
    expect(demo.getAllByText("Watched to the end")[0].nextElementSibling).toHaveTextContent("19");
    expect(demo.getByText("40%")).toBeInTheDocument();
    expect(demo.getByText("Of those who opened it")).toBeInTheDocument();
    expect(demo.getByRole("img", { name: /Demo video, opened and finished/ })).toBeInTheDocument();
  });

  it("shows None yet for the share who finished the video when nobody has opened it", () => {
    render(<AdminDashboard stats={{ ...stats, demo: { ...stats.demo, opened_total: 0, finished_total: 0 } }} />);

    expect(within(section("The demo video")).getByText("None yet")).toBeInTheDocument();
  });

  it("draws a line chart for each thing over time, every day also a table for a screen reader", () => {
    render(<AdminDashboard stats={stats} />);

    const activity = within(section("Activity over time"));
    for (const name of ["People using Brief", "Documents and questions", "Time in Brief", "Visits"]) {
      expect(activity.getByRole("img", { name: new RegExp(`^${name}, over 3 days`) })).toBeInTheDocument();
    }
    const rows = within(activity.getByRole("table", { name: "People using Brief" })).getAllByRole("row");
    expect(rows).toHaveLength(4); // the header and three days
    expect(within(rows[3]).getByRole("rowheader")).toHaveTextContent("Nov 12");
    expect(within(rows[3]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["4", "2"]);
  });

  it("shows how many people signed up and were active, and how long they stay", () => {
    render(<AdminDashboard stats={stats} />);

    const people = within(section("People"));
    expect(people.getByText("Signed up").nextElementSibling).toHaveTextContent("12");
    expect(people.getByText("New this week").nextElementSibling).toHaveTextContent("5");
    expect(people.getByText("Active today").nextElementSibling).toHaveTextContent("3");
    expect(people.getByText("Average visit").nextElementSibling).toHaveTextContent("3.2 min");
    expect(people.getByText("Per person, per day").nextElementSibling).toHaveTextContent("6.5 min");
    expect(people.getByText("11 in 30 days")).toBeInTheDocument();
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

  it("has the report downloads in its own section", () => {
    render(<AdminDashboard stats={stats} />);

    const reports = within(section("Download a report"));
    expect(reports.getByRole("heading", { name: "Daily report" })).toBeInTheDocument();
    expect(reports.getByRole("heading", { name: "Monthly report" })).toBeInTheDocument();
  });

  it("says so, plainly, when there is nothing to show yet, and does not break", () => {
    render(
      <AdminDashboard
        stats={{ ...stats, documents: { ...stats.documents, stored: 0, by_kind: {}, by_status: {} }, reasons: {}, by_day: [], site: { model_calls_today: 0, daily_limit: 0 }, funnel: { signed_up: 0, uploaded_a_document: 0, asked_a_question: 0, came_back_another_day: 0, shared_their_dashboard: 0 } }}
      />,
    );

    expect(screen.getByText("Nobody has signed up yet.")).toBeInTheDocument();
    expect(screen.getAllByText("No documents yet.")).toHaveLength(2);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(within(section("How far people get")).getAllByRole("listitem")[1]).toHaveTextContent("none of the step before");
  });

  it("has no name, address or document anywhere on it", () => {
    const { container } = render(<AdminDashboard stats={stats} />);

    expect(container.textContent).not.toMatch(/@|\.pdf|\.jpg/i);
  });
});
