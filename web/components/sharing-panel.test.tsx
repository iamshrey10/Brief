// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sharing")>();
  return { ...actual, createShare: vi.fn(), approveShare: vi.fn(), removeShare: vi.fn() };
});

import { approveShare, createShare, removeShare, type Share } from "@/lib/sharing";
import { SharingPanel } from "./sharing-panel";

const createMock = vi.mocked(createShare);
const approveMock = vi.mocked(approveShare);
const removeMock = vi.mocked(removeShare);

const share = (over: Partial<Share>): Share => ({
  id: "s1",
  label: "Mum",
  status: "invited",
  viewer_email: null,
  viewer_name: null,
  created_at: "2026-11-01T10:00:00Z",
  expires_at: "2026-11-08T10:00:00Z",
  last_viewed_at: null,
  ...over,
});
const INVITATION = { id: "new1", token: "T".repeat(43), code: "482913", expires_at: "2026-11-11T10:00:00Z" };

beforeEach(() => {
  createMock.mockReset();
  approveMock.mockReset();
  removeMock.mockReset();
});
afterEach(cleanup);

describe("the sharing panel", () => {
  it("says what a person can and cannot do with the dashboard, and how many people", () => {
    render(<SharingPanel initial={[]} />);

    const panel = screen.getByRole("region", { name: "Share your dashboard" });
    expect(panel).toHaveTextContent("They can only look");
    expect(panel).toHaveTextContent("cannot change anything or open your files");
    expect(panel).toHaveTextContent("Up to 5 people");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows each person's state: not used yet, asking, or able to view and when they last looked", () => {
    const yesterday = new Date(Date.now() - 36 * 3_600_000).toISOString();
    render(
      <SharingPanel
        initial={[
          share({ id: "a", label: "Dad" }),
          share({ id: "b", status: "requested", viewer_email: "sam@example.com" }),
          share({ id: "c", status: "active", viewer_email: "kim@example.com", last_viewed_at: yesterday, expires_at: null }),
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "People with access" });
    expect(within(list).getByText("Dad").parentElement).toHaveTextContent("Invitation sent, not used yet");
    expect(within(list).getByText("sam@example.com").parentElement).toHaveTextContent("Waiting for your approval");
    expect(within(list).getByText("kim@example.com").parentElement).toHaveTextContent("Can view · Looked yesterday");
    expect(screen.getByText("3 of 5 places used")).toBeInTheDocument();
  });
});

describe("people with a name", () => {
  it("shows the name, with the address beneath it, in place of the address alone", () => {
    render(<SharingPanel initial={[share({ status: "active", viewer_email: "sam@example.com", viewer_name: "Sam Lee" })]} />);

    const item = screen.getByRole("list", { name: "People with access" }).querySelector("li")!;
    expect(item).toHaveTextContent("Sam Lee");
    expect(item).toHaveTextContent("sam@example.com");
    expect(screen.getByRole("button", { name: "Remove access for Sam Lee" })).toBeInTheDocument();
  });
});

describe("making an invitation", () => {
  it("shows the link and the code once, with the name that was typed, and adds the person to the list", async () => {
    createMock.mockResolvedValue({ ok: true, result: INVITATION });
    render(<SharingPanel initial={[]} />);
    fireEvent.change(screen.getByLabelText(/Who is it for/), { target: { value: "  Mum " } });

    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));

    const fresh = await screen.findByRole("region", { name: "New invitation" });
    expect(createMock).toHaveBeenCalledExactlyOnceWith("Mum");
    expect(within(fresh).getByLabelText("Invitation link")).toHaveValue(`${window.location.origin}/shared/join/${INVITATION.token}`);
    expect(within(fresh).getByLabelText("Invitation code")).toHaveTextContent("482913");
    expect(fresh).toHaveTextContent("works for 7 days");
    expect(within(screen.getByRole("list", { name: "People with access" })).getByText("Mum")).toBeInTheDocument();
    expect(screen.getByLabelText(/Who is it for/)).toHaveValue("");

    fireEvent.click(within(fresh).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: "New invitation" })).not.toBeInTheDocument();
  });

  it("copies the code, and says so", async () => {
    createMock.mockResolvedValue({ ok: true, result: INVITATION });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SharingPanel initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    await screen.findByRole("region", { name: "New invitation" });

    fireEvent.click(screen.getByRole("button", { name: "Copy the code" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copied the code" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith("482913");
  });

  it("does not claim a copy when the browser refuses it", async () => {
    createMock.mockResolvedValue({ ok: true, result: INVITATION });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    render(<SharingPanel initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    await screen.findByRole("region", { name: "New invitation" });

    fireEvent.click(screen.getByRole("button", { name: "Copy the link" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy the link" })).toBeInTheDocument());
  });

  it("shows why it failed and adds no one", async () => {
    createMock.mockResolvedValue({ ok: false, message: "Couldn't do that just now." });
    render(<SharingPanel initial={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't do that just now.");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("turns the button off and says so when all five places are used", () => {
    render(<SharingPanel initial={["a", "b", "c", "d", "e"].map((id) => share({ id }))} />);

    expect(screen.getByRole("button", { name: "Create invitation" })).toBeDisabled();
    expect(screen.getByText(/All 5 places are used/)).toBeInTheDocument();
  });
});

describe("approving and removing", () => {
  it("approves a request, which then shows as able to view", async () => {
    approveMock.mockResolvedValue({ ok: true, result: null });
    render(<SharingPanel initial={[share({ status: "requested", viewer_email: "sam@example.com" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve sam@example.com" }));

    await waitFor(() => expect(screen.getByText(/Can view/)).toBeInTheDocument());
    expect(approveMock).toHaveBeenCalledExactlyOnceWith("s1");
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove access for sam@example.com" })).toBeInTheDocument();
  });

  it("keeps the request and says why when approving fails", async () => {
    approveMock.mockResolvedValue({ ok: false, message: "That one is no longer here." });
    render(<SharingPanel initial={[share({ status: "requested", viewer_email: "sam@example.com" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve sam@example.com" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no longer here");
    expect(screen.getByText("Waiting for your approval")).toBeInTheDocument();
  });

  it.each([
    ["invited", "Cancel invitation for Mum", "Cancel invitation"],
    ["requested", "Decline sam@example.com", "Decline"],
    ["active", "Remove access for sam@example.com", "Remove access"],
  ] as const)("%s: the button says what it does and takes the person off the list", async (status, name, visible) => {
    removeMock.mockResolvedValue({ ok: true, result: null });
    render(<SharingPanel initial={[share({ status, viewer_email: status === "invited" ? null : "sam@example.com" })]} />);

    const button = screen.getByRole("button", { name });
    expect(button).toHaveTextContent(visible);
    fireEvent.click(button);

    await waitFor(() => expect(screen.queryByRole("list")).not.toBeInTheDocument());
    expect(removeMock).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("keeps the person and says why when removing fails", async () => {
    removeMock.mockResolvedValue({ ok: false, message: "Couldn't do that just now." });
    render(<SharingPanel initial={[share({ status: "active", viewer_email: "kim@example.com" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove access for kim@example.com" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't do that just now.");
    expect(screen.getByText("kim@example.com")).toBeInTheDocument();
  });

  it("closes the invitation box when its own invitation is cancelled", async () => {
    createMock.mockResolvedValue({ ok: true, result: INVITATION });
    removeMock.mockResolvedValue({ ok: true, result: null });
    render(<SharingPanel initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    await screen.findByRole("region", { name: "New invitation" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel invitation for Unnamed invitation" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "New invitation" })).not.toBeInTheDocument());
  });
});
