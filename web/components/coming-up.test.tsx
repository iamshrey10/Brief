// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComingUp } from "./coming-up";

const documents = [
  { id: "d1", filename: "maple-lease.pdf" },
  { id: "d2", filename: "job-offer.pdf" },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0)); // October 30, 2026, local time
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the coming up strip", () => {
  it("lists the soonest dates with how far off they are, each linking to its document", () => {
    render(
      <ComingUp
        documents={documents}
        keyDates={[
          { document_id: "d1", field: "lease_end", label: "Lease ends", value: "December 31, 2026" },
          { document_id: "d2", field: "start_date", label: "Job starts", value: "November 2, 2026" },
        ]}
      />,
    );

    const list = screen.getByRole("list");
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Job starts in 3 daysjob-offer.pdf", "Lease ends in 62 daysmaple-lease.pdf"]);
    expect(links[0]).toHaveAttribute("href", "/dashboard/documents/d2");
    expect(screen.getByRole("region", { name: "Coming up" })).toBeInTheDocument();
  });

  it("counts from the person's own date", () => {
    vi.setSystemTime(new Date(2026, 11, 30, 23, 59)); // December 30, late at night
    render(<ComingUp documents={documents} keyDates={[{ document_id: "d1", field: "lease_end", label: "x", value: "December 31, 2026" }]} />);

    expect(screen.getByText("Lease ends tomorrow")).toBeInTheDocument();
  });

  it("shows nothing when no date is clear, when none belong to a listed document, or when there are none", () => {
    const loose = { document_id: "d1", field: "lease_end", label: "x", value: "six months after graduation" };
    const stranger = { document_id: "elsewhere", field: "lease_end", label: "x", value: "December 31, 2026" };

    for (const keyDates of [[loose], [stranger], []]) {
      const { container, unmount } = render(<ComingUp documents={documents} keyDates={keyDates} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
