// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PendingBadge } from "./pending-badge";
import { UploadNotifications } from "./upload-notifications";

const requested = (id: string) => ({ id, label: null, status: "requested", viewer_email: "a@example.com", viewer_name: null, created_at: "2026-11-06T00:00:00Z", expires_at: null, last_viewed_at: null });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function withWaiting(count: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => Array.from({ length: count }, (_, index) => requested(`s${index}`)) }));
  const view = render(
    <UploadNotifications>
      <button type="button">
        Shared
        <PendingBadge />
      </button>
    </UploadNotifications>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  return view;
}

describe("PendingBadge", () => {
  it("shows nothing when nobody is waiting, and nothing at all outside the signed in pages", () => {
    const { container } = render(<PendingBadge />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the list has no one waiting", async () => {
    await withWaiting(0);

    expect(screen.getByRole("button")).toHaveAccessibleName("Shared");
  });

  it("shows the number in red, and tells screen readers one person is waiting", async () => {
    await withWaiting(1);

    expect(screen.getByRole("button")).toHaveAccessibleName(/^Shared\s*, 1 person is waiting for your approval$/);
    expect(screen.getByText("1")).toHaveClass("bg-red-600");
  });

  it("says people, in the plural, for more than one", async () => {
    await withWaiting(3);

    expect(screen.getByRole("button")).toHaveAccessibleName(/3 people are waiting for your approval/);
  });
});
