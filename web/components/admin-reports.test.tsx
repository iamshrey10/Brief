// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const saved: { name: string; type: string; size: number }[] = [];
vi.mock("@/lib/download", () => ({
  downloadTextFile: (name: string, text: string, type: string) => saved.push({ name, type, size: text.length }),
  downloadBytes: (name: string, bytes: Uint8Array, type: string) => saved.push({ name, type, size: bytes.length }),
}));

import { AdminReports } from "./admin-reports";

const REPORT = {
  period: "day", label: "2026-11-12", from: "2026-11-12", to: "2026-11-12", generated_at: "2026-11-13T00:00:00Z",
  totals: { signed_up: 3, people: 5, visits: 9, minutes: 41.5, documents: 6, questions: 22, reads: 4, overviews: 3, demo_opened: 11, demo_finished: 4, average_minutes_per_visit: 4.6 },
  reasons_of_new_people: { lease: 2 },
  by_day: [{ day: "2026-11-12", signed_up: 3, people: 5, visits: 9, minutes: 41.5, documents: 6, questions: 22, reads: 4, overviews: 3, demo_opened: 11, demo_finished: 4 }],
};
let fetchMock: Mock;
const NOW = new Date("2026-11-13T10:00:00Z");

beforeEach(() => {
  saved.length = 0;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => REPORT }) as Response);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const click = async (name: RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};

describe("the report downloads", () => {
  it("offers a daily and a monthly report, a day defaulting to yesterday and a month to this one", () => {
    render(<AdminReports today={NOW} />);

    expect(screen.getByLabelText("Day")).toHaveValue("2026-11-12");
    expect(screen.getByLabelText("Month")).toHaveValue("2026-11");
    expect(screen.getByLabelText("Day")).toHaveAttribute("max", "2026-11-13");
    expect(screen.getByLabelText("Month")).toHaveAttribute("max", "2026-11");
    expect(screen.getByText(/never name a person, a document or a question/)).toBeInTheDocument();
  });

  it("asks for the day, makes a spreadsheet of it and saves it", async () => {
    render(<AdminReports today={NOW} />);

    await click(/daily report as a CSV spreadsheet/);

    expect(fetchMock).toHaveBeenCalledWith("/api/backend/admin/report?period=day&date=2026-11-12", { cache: "no-store" });
    expect(saved).toEqual([{ name: "brief-daily-report-2026-11-12.csv", type: "text/csv;charset=utf-8", size: expect.any(Number) }]);
    expect(screen.getByRole("status")).toHaveTextContent("Saved the daily report for 2026-11-12.");
  });

  it("makes a PDF of a month, asking for its first day", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...REPORT, period: "month", label: "2026-11" }) } as Response);
    render(<AdminReports today={NOW} />);

    await click(/monthly report as a PDF/);

    expect(fetchMock).toHaveBeenCalledWith("/api/backend/admin/report?period=month&date=2026-11-01", { cache: "no-store" });
    expect(saved[0]).toMatchObject({ name: "brief-monthly-report-2026-11.pdf", type: "application/pdf" });
    expect(saved[0].size).toBeGreaterThan(200);
  });

  it("uses the day or month that was chosen", async () => {
    render(<AdminReports today={NOW} />);
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-09" } });

    await click(/daily report as a CSV spreadsheet/);
    await click(/monthly report as a CSV spreadsheet/);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/backend/admin/report?period=day&date=2026-10-03", "/api/backend/admin/report?period=month&date=2026-09-01"]);
  });

  it("asks for a day or month first when the box was emptied, and sends nothing", async () => {
    render(<AdminReports today={NOW} />);
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "" } });

    await click(/daily report as a PDF/);
    expect(screen.getByRole("status")).toHaveTextContent("Choose a day first.");
    await click(/monthly report as a PDF/);
    expect(screen.getByRole("status")).toHaveTextContent("Choose a month first.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so, plainly, when the report cannot be made, and saves nothing", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ detail: "not found" }) } as Response);
    render(<AdminReports today={NOW} />);

    await click(/daily report as a CSV spreadsheet/);
    expect(screen.getByRole("status")).toHaveTextContent("The report could not be made just now. Try again in a moment.");

    fetchMock.mockRejectedValue(new Error("offline"));
    await click(/daily report as a PDF/);
    expect(screen.getByRole("status")).toHaveTextContent("could not be made");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ not: "a report" }) } as Response);
    await click(/monthly report as a CSV spreadsheet/);
    expect(screen.getByRole("status")).toHaveTextContent("could not be made");

    expect(saved).toEqual([]);
  });

  it("takes only one download at a time", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
    render(<AdminReports today={NOW} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /daily report as a CSV spreadsheet/ }));
    });

    expect(screen.getByRole("button", { name: /daily report as a CSV spreadsheet/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /monthly report as a PDF/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /daily report as a CSV spreadsheet/ })).toHaveTextContent("Making...");
    await act(async () => finish({ ok: true, json: async () => REPORT } as Response));
    expect(screen.getByRole("button", { name: /daily report as a CSV spreadsheet/ })).toBeEnabled();
  });
});
