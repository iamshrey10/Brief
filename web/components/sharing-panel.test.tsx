// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sharing")>();
  return { ...actual, createShare: vi.fn(), approveShare: vi.fn(), removeShare: vi.fn(), changeShareAccess: vi.fn() };
});

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { approveShare, changeShareAccess, createShare, removeShare, type Share } from "@/lib/sharing";
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
  access_hours: 168,
  access_until: null,
  access_ends_at: null,
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
    expect(createMock).toHaveBeenCalledExactlyOnceWith("Mum", { kind: "hours", hours: 168 });
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

  it("puts people waiting to be let in first, marked as a new request", () => {
    render(
      <SharingPanel
        initial={[share({ id: "a", status: "active", viewer_name: "Active Person", viewer_email: "a@example.com", expires_at: null }), share({ id: "b", status: "requested", viewer_name: "Asha Rao", viewer_email: "asha@example.com" })]}
      />,
    );

    const people = within(screen.getByRole("list", { name: "People with access" })).getAllByRole("listitem");
    expect(people[0]).toHaveTextContent("New request");
    expect(people[0]).toHaveTextContent("Asha Rao");
    expect(people[1]).not.toHaveTextContent("New request");
  });

  it("does not ask the page for the list again just because it opened", () => {
    refreshMock.mockClear();

    render(<SharingPanel initial={[share({})]} />);

    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("emailing the invitation", () => {
  const LINK = `${window.location.origin}/shared/join/${INVITATION.token}`;
  const open = async (ownerName = "Alex Morgan") => {
    createMock.mockResolvedValue({ ok: true, result: INVITATION });
    render(<SharingPanel initial={[]} ownerName={ownerName} />);
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    return within(await screen.findByRole("region", { name: "New invitation" }));
  };

  it("offers Gmail and the person's mail app, with the link and the code already written into the message", async () => {
    const fresh = await open();

    const gmail = fresh.getByRole("link", { name: "Email it with Gmail" });
    const mailApp = fresh.getByRole("link", { name: "Email it with my mail app" });

    const message = new URL(gmail.getAttribute("href")!);
    expect(message.searchParams.get("su")).toBe("Alex Morgan shared a Brief dashboard with you");
    expect(message.searchParams.get("body")).toContain(LINK);
    expect(message.searchParams.get("body")).toContain("482913");
    expect(gmail).toHaveAttribute("target", "_blank");
    expect(mailApp.getAttribute("href")).toContain("mailto:?subject=");
    expect(mailApp.getAttribute("href")).toContain(encodeURIComponent(LINK));
  });

  it("puts the address that was typed in the To line", async () => {
    const fresh = await open();

    fireEvent.change(fresh.getByLabelText(/Their email address/), { target: { value: " mum@example.com " } });

    expect(new URL(fresh.getByRole("link", { name: "Email it with Gmail" }).getAttribute("href")!).searchParams.get("to")).toBe("mum@example.com");
    expect(fresh.getByRole("link", { name: "Email it with my mail app" }).getAttribute("href")).toContain("mailto:mum@example.com?");
  });

  it("turns the two buttons off and says why when the address does not look right", async () => {
    const fresh = await open();

    fireEvent.change(fresh.getByLabelText(/Their email address/), { target: { value: "mum@" } });

    expect(fresh.getByRole("alert")).toHaveTextContent("does not look like an email address");
    expect(fresh.queryByRole("link", { name: /Email it/ })).not.toBeInTheDocument();
    expect(fresh.getByText("Email it with Gmail")).toHaveAttribute("aria-disabled", "true");
    expect(fresh.getByLabelText(/Their email address/)).toHaveAttribute("aria-invalid", "true");
  });

  it("says it is Brief that sends nothing, and that approval is what protects the dashboard", async () => {
    const fresh = await open();

    expect(fresh.getByText(/Brief does not send it or keep it/)).toBeInTheDocument();
    expect(fresh.getByText(/nobody sees your dashboard until you approve them here/)).toBeInTheDocument();
  });

  it("forgets the address when the invitation is put away", async () => {
    const fresh = await open();
    fireEvent.change(fresh.getByLabelText(/Their email address/), { target: { value: "mum@example.com" } });

    fireEvent.click(fresh.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("region", { name: "New invitation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(within(await screen.findByRole("region", { name: "New invitation" })).getByLabelText(/Their email address/)).toHaveValue("");
  });

  it("writes a message without a name when the person has none", async () => {
    const fresh = await open("");

    expect(new URL(fresh.getByRole("link", { name: "Email it with Gmail" }).getAttribute("href")!).searchParams.get("su")).toBe("A Brief dashboard shared with you");
  });
});

describe("how long they may look", () => {
  const changeMock = vi.mocked(changeShareAccess);
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000 + 60_000).toISOString();

  beforeEach(() => changeMock.mockReset());

  it("asks how long, with a week chosen, before the invitation is made", () => {
    render(<SharingPanel initial={[]} />);

    expect((screen.getByLabelText("How long can they look?") as HTMLSelectElement).value).toBe("168");
    expect(screen.getByText(/The time starts when you approve them/)).toBeInTheDocument();
  });

  it("sends the length that was picked with the invitation", async () => {
    createMock.mockResolvedValue({ ok: true, result: { ...INVITATION, access_hours: 24 } });
    render(<SharingPanel initial={[]} />);

    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));

    await screen.findByRole("region", { name: "New invitation" });
    expect(createMock).toHaveBeenCalledExactlyOnceWith("", { kind: "hours", hours: 24 });
    expect(screen.getByRole("region", { name: "New invitation" })).toHaveTextContent("they can look for 1 day");
  });

  it("waits for a day to be picked when a date was asked for", () => {
    render(<SharingPanel initial={[]} />);

    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "date" } });

    expect(screen.getByRole("button", { name: "Create invitation" })).toBeDisabled();
  });

  it("shows how long someone who is not approved yet will be able to look", () => {
    render(<SharingPanel initial={[share({ status: "requested", viewer_email: "a@x.com", access_hours: 720 })]} />);

    expect(screen.getByText("Can look for 30 days once you approve")).toBeInTheDocument();
  });

  it("shows how long is left for someone who can look now", () => {
    render(<SharingPanel initial={[share({ status: "active", viewer_email: "a@x.com", expires_at: null, access_ends_at: inDays(3) })]} />);

    expect(screen.getByText("Ends in 3 days")).toBeInTheDocument();
    expect(screen.queryByText(/once you approve/)).not.toBeInTheDocument();
  });

  it("lets the owner change the time, and saves it", async () => {
    changeMock.mockResolvedValue({ ok: true, result: null });
    render(<SharingPanel initial={[share({ status: "active", viewer_email: "a@x.com", expires_at: null, access_ends_at: inDays(1) })]} />);

    fireEvent.click(screen.getByRole("button", { name: /Change the time for/ }));
    fireEvent.change(screen.getByLabelText("Give them time from now"), { target: { value: "2160" } });
    fireEvent.click(screen.getByRole("button", { name: "Save time" }));

    await waitFor(() => expect(changeMock).toHaveBeenCalledExactlyOnceWith("s1", { kind: "hours", hours: 2160 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save time" })).not.toBeInTheDocument());
    expect(refreshMock).toHaveBeenCalled();
  });

  it("says why when the time could not be changed, and keeps the picker open", async () => {
    changeMock.mockResolvedValue({ ok: false, message: "That share has ended. Make a new invitation to share again." });
    render(<SharingPanel initial={[share({ status: "active", viewer_email: "a@x.com", expires_at: null, access_ends_at: inDays(1) })]} />);

    fireEvent.click(screen.getByRole("button", { name: /Change the time for/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save time" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That share has ended");
    expect(screen.getByRole("button", { name: "Save time" })).toBeInTheDocument();
  });

  it("can close the picker without changing anything", () => {
    render(<SharingPanel initial={[share({ status: "active", viewer_email: "a@x.com", expires_at: null, access_ends_at: inDays(1) })]} />);

    fireEvent.click(screen.getByRole("button", { name: /Change the time for/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Save time" })).not.toBeInTheDocument();
    expect(changeMock).not.toHaveBeenCalled();
  });

  it("offers no time change for someone who is not approved yet", () => {
    render(<SharingPanel initial={[share({ status: "requested", viewer_email: "a@x.com" })]} />);

    expect(screen.queryByRole("button", { name: /Change the time for/ })).not.toBeInTheDocument();
  });
});
