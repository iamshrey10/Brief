// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const joinShare = vi.fn();
vi.mock("@/lib/sharing", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/sharing")>()), joinShare: (...args: unknown[]) => joinShare(...args) }));

import { JoinByLink } from "./join-by-link";
import { SharedWithYou } from "./shared-with-you";

const TOKEN = "a".repeat(43);

beforeEach(() => {
  refresh.mockReset();
  joinShare.mockReset();
});
afterEach(cleanup);

describe("SharedWithYou", () => {
  it("lists who shared a dashboard, links the approved ones and says which are waiting", () => {
    render(
      <SharedWithYou
        items={[
          { id: "s1", owner_email: "mum@example.com", owner_name: "Asha Rao", status: "active" },
          { id: "s2", owner_email: "dad@example.com", owner_name: null, status: "requested" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Shared with you" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View dashboard" })).toHaveAttribute("href", "/dashboard/shared/s1");
    expect(screen.getByText("Waiting for their approval")).toBeInTheDocument();
    expect(screen.getByText(/1 waiting for their approval/)).toBeInTheDocument();
    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
  });

  it("with nothing shared, shows only the place to enter a link and code, open", () => {
    const { container } = render(<SharedWithYou items={[]} headingLevel={3} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });
});

describe("JoinByLink", () => {
  it("picks the secret out of a pasted link, sends it with the code and refreshes", async () => {
    joinShare.mockResolvedValue({ ok: true, result: { owner_email: "mum@example.com", owner_name: "Asha Rao", status: "requested" } });
    render(<JoinByLink />);

    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: `https://brief.example/shared/join/${TOKEN}?x=1` } });
    fireEvent.change(screen.getByLabelText("Six digit code"), { target: { value: "48a2913" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Asha Rao"));
    expect(joinShare).toHaveBeenCalledWith(TOKEN, "482913");
    expect(refresh).toHaveBeenCalled();
  });

  it("says so when what was pasted is not a share link, and sends nothing", () => {
    render(<JoinByLink />);

    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: "hello" } });
    fireEvent.change(screen.getByLabelText("Six digit code"), { target: { value: "482913" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));

    expect(screen.getByRole("alert")).toHaveTextContent("doesn't look like a share link");
    expect(joinShare).not.toHaveBeenCalled();
  });

  it("shows why the code was turned away", async () => {
    joinShare.mockResolvedValue({ ok: false, message: "That code isn't right." });
    render(<JoinByLink />);

    fireEvent.change(screen.getByLabelText("Share link"), { target: { value: TOKEN } });
    fireEvent.change(screen.getByLabelText("Six digit code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That code isn't right."));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the button off until there is a link and six digits", () => {
    render(<JoinByLink />);

    expect(screen.getByRole("button", { name: "Ask for access" })).toBeDisabled();
  });
});
