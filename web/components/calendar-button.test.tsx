// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/download", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/download")>()), downloadTextFile: vi.fn() }));

import { downloadTextFile } from "@/lib/download";
import { CalendarButton } from "./calendar-button";

const download = vi.mocked(downloadTextFile);
const term = (name: string, value: string | null, found = true) => ({ name, found, value });

afterEach(() => {
  cleanup();
  download.mockReset();
});

describe("the calendar button", () => {
  it("is not shown when no date is clear enough to add", () => {
    const { container } = render(
      <CalendarButton documentId="d1" filename="lease.pdf" terms={[term("lease_end", "when the tenant moves out"), term("monthly_rent", "$1,650")]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says how many dates it will add, in the singular and the plural", () => {
    const one = render(<CalendarButton documentId="d1" filename="lease.pdf" terms={[term("lease_end", "December 31, 2027")]} />);
    expect(screen.getByRole("button", { name: /Add this date to your calendar/ })).toBeInTheDocument();
    one.unmount();

    render(<CalendarButton documentId="d1" filename="lease.pdf" terms={[term("lease_start", "January 1, 2027"), term("lease_end", "December 31, 2027")]} />);
    expect(screen.getByRole("button", { name: /Add these 2 dates to your calendar/ })).toBeInTheDocument();
  });

  it("saves a calendar file named after the document, with an event for each clear date and a week's warning before the end", () => {
    render(<CalendarButton documentId="d1" filename="Maple Court.pdf" terms={[term("lease_start", "January 1, 2027"), term("lease_end", "December 31, 2027")]} />);

    fireEvent.click(screen.getByRole("button"));

    expect(download).toHaveBeenCalledOnce();
    const [name, file, type] = download.mock.calls[0];
    expect(name).toBe("Maple-Court-dates.ics");
    expect(type).toBe("text/calendar");
    expect(file).toContain("SUMMARY:Lease starts: Maple Court.pdf");
    expect(file).toContain("DTSTART;VALUE=DATE:20271231");
    expect(file).toContain("TRIGGER:-P7D");
    expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
