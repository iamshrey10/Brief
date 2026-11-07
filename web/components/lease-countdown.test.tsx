// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/download", async (original) => ({ ...(await original<typeof import("@/lib/download")>()), downloadTextFile: download }));

import { LeaseCountdown, leaseDaysText } from "./lease-countdown";

beforeEach(() => {
  window.localStorage.clear();
  download.mockReset();
});
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

describe("the reminder bell remembers what it did", () => {
  const lease = { documentId: "a", filename: "maple.pdf", value: "March 9, 2027", days: 126 };
  const bell = (name: string) => screen.getByRole("button", { name });

  it("saves one calendar file with the lease end, then says it was added", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<LeaseCountdown lease={lease} />);

    await userEvent.click(bell("Remind me in my calendar"));
    await userEvent.click(screen.getByRole("button", { name: /Download calendar file/ }));

    expect(download).toHaveBeenCalledTimes(1);
    const [name, text, type] = download.mock.calls[0];
    expect(name).toBe("maple-lease-end.ics");
    expect(type).toBe("text/calendar");
    expect(text).toContain("UID:a-lease_end@brief");
    expect(text).toContain("DTSTART;VALUE=DATE:20270309");
    expect(text).toContain("SUMMARY:Lease ends: maple.pdf");
    expect(bell("Added to your calendar")).toBeInTheDocument();
  });

  it("says so after the page is opened again, and offers no second copy unless asked", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const first = render(<LeaseCountdown lease={lease} />);
    await userEvent.click(bell("Remind me in my calendar"));
    await userEvent.click(screen.getByRole("button", { name: /Download calendar file/ }));
    first.unmount();

    render(<LeaseCountdown lease={lease} />);
    await userEvent.click(await screen.findByRole("button", { name: "Added to your calendar" }));

    expect(screen.getByRole("status")).toHaveTextContent("Added to your calendar");
    expect(screen.queryByRole("button", { name: /Download calendar file/ })).not.toBeInTheDocument();
    expect(download).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Not there? Add it again" }));
    expect(bell("Remind me in my calendar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download calendar file/ })).toBeInTheDocument();
  });

  it("marks the reminder added when the Google Calendar link is used", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<LeaseCountdown lease={lease} />);
    await userEvent.click(bell("Remind me in my calendar"));
    const link = screen.getByRole("link", { name: /Lease ends: March 9, 2027/ });
    link.addEventListener("click", (event) => event.preventDefault());

    await userEvent.click(link);

    expect(bell("Added to your calendar")).toBeInTheDocument();
    expect(window.localStorage.getItem("brief-reminder-added:a:March 9, 2027")).toBe("1");
  });

  it("says plainly when the file could not be made, and does not mark it added", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    download.mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<LeaseCountdown lease={lease} />);

    await userEvent.click(bell("Remind me in my calendar"));
    await userEvent.click(screen.getByRole("button", { name: /Download calendar file/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("The calendar file could not be made. Please try again.");
    expect(bell("Remind me in my calendar")).toBeInTheDocument();
    expect(window.localStorage.getItem("brief-reminder-added:a:March 9, 2027")).toBeNull();
  });

  it("still works when the browser will not store anything", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const blocked = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    render(<LeaseCountdown lease={lease} />);

    await userEvent.click(bell("Remind me in my calendar"));
    await userEvent.click(screen.getByRole("button", { name: /Download calendar file/ }));

    expect(bell("Added to your calendar")).toBeInTheDocument();
    blocked.mockRestore();
    set.mockRestore();
  });
});
