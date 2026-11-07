// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeaseCountdown, leaseDaysText } from "./lease-countdown";

afterEach(cleanup);

describe("the lease countdown words", () => {
  it.each([
    [10, "10 days left"],
    [1, "Ends tomorrow"],
    [0, "Ends today"],
    [-1, "Ended yesterday"],
    [-4, "Ended 4 days ago"],
  ])("%i days reads %s", (days, text) => expect(leaseDaysText(days)).toBe(text));
});

describe("the lease countdown card", () => {
  it("shows nothing when there is no lease end", () => {
    const { container } = render(<LeaseCountdown lease={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the days left, the date, and a link to the lease", () => {
    render(<LeaseCountdown lease={{ documentId: "a", filename: "maple.pdf", value: "March 9, 2027", days: 126 }} />);

    const card = screen.getByRole("region", { name: "Lease remaining" });
    expect(card).toHaveTextContent("126 days left");
    expect(card).toHaveTextContent("Ends March 9, 2027");
    expect(screen.getByRole("link", { name: "maple.pdf" })).toHaveAttribute("href", "/dashboard/documents/a");
  });

  it("names the lease without a link when the viewer could not open it", () => {
    render(<LeaseCountdown lease={{ documentId: "a", filename: "maple.pdf", value: "March 9, 2027", days: 126 }} linked={false} />);

    expect(screen.getByRole("region", { name: "Lease remaining" })).toHaveTextContent("maple.pdf");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("is tinted when the end is within 60 days, and plain when it is further off or over", () => {
    const { rerender } = render(<LeaseCountdown lease={{ documentId: "a", filename: "m.pdf", value: "x", days: 60 }} />);
    expect(screen.getByRole("region").className).toContain("amber");
    rerender(<LeaseCountdown lease={{ documentId: "a", filename: "m.pdf", value: "x", days: 61 }} />);
    expect(screen.getByRole("region").className).not.toContain("amber");
    rerender(<LeaseCountdown lease={{ documentId: "a", filename: "m.pdf", value: "x", days: -3 }} />);
    expect(screen.getByRole("region").className).not.toContain("amber");
  });
});

describe("the reminder bell", () => {
  const lease = { documentId: "a", filename: "maple.pdf", value: "March 9, 2027", days: 126 };

  it("offers Google Calendar and a calendar file for the lease end", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<LeaseCountdown lease={lease} />);

    await userEvent.click(screen.getByRole("button", { name: "Remind me in my calendar" }));

    expect(screen.getByRole("link", { name: /Lease ends: March 9, 2027/ })).toHaveAttribute("href", expect.stringContaining("calendar.google.com"));
    expect(screen.getByRole("button", { name: /Download calendar file/ })).toBeInTheDocument();
  });

  it("is left out once the lease has ended", () => {
    render(<LeaseCountdown lease={{ ...lease, days: -3 }} />);
    expect(screen.queryByRole("button", { name: "Remind me in my calendar" })).not.toBeInTheDocument();
  });
});
