// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemindersCard } from "./reminders-card";
import type { Reminder } from "@/lib/reminders";

const TODAY = "2026-11-17";

// The card swaps the server's date for the browser's own a moment after it loads, so the test pins the browser's date too. Without this it fails every day after TODAY.
vi.mock("@/lib/dates", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/dates")>();
  return { ...real, localToday: () => ({ year: 2026, month: 11, day: 17 }) };
});
const fetchMock = vi.fn();

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  title: "Call the landlord",
  description: null,
  dueDate: "2026-11-20",
  dueTime: null,
  documentId: null,
  documentName: null,
  completed: false,
  ...over,
});
const wire = (r: Reminder) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  due_date: r.dueDate,
  due_time: r.dueTime,
  document_id: r.documentId,
  document_name: r.documentName,
  completed: r.completed,
});
const answer = (status: number, body?: unknown) => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
const DOCS = [
  { id: "d1", filename: "lease.pdf" },
  { id: "d2", filename: "loan.pdf" },
];

function show(props: Partial<React.ComponentProps<typeof RemindersCard>> = {}) {
  return render(<RemindersCard initial={[]} loadFailed={false} documents={DOCS} lease={null} todayISO={TODAY} {...props} />);
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
const inDialog = () => within(dialog());

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add a reminder" }));
}

describe("the Reminders card", () => {
  it("has the heading and a small plus button that says what it does", () => {
    show();

    const heading = screen.getByRole("heading", { level: 2, name: "Reminders" });
    const plus = screen.getByRole("button", { name: "Add a reminder" });
    expect(heading).toBeInTheDocument();
    expect(plus).toBeInTheDocument();
    expect(heading.parentElement).toContainElement(plus);
  });

  it("explains an empty list in a sentence, without promising alerts", () => {
    show();

    expect(screen.getByText(/Nothing here yet\. Press \+ to add a reminder/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/notif|we will remind|we.ll remind/i);
  });

  it("keeps what was found in a document apart from the person's own reminders", () => {
    show({ lease: { documentId: "d1", filename: "lease.pdf", value: "December 31, 2099", days: 100 }, initial: [reminder()] });

    expect(screen.getByRole("heading", { level: 3, name: "From your documents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Your reminders" })).toBeInTheDocument();
    const lease = screen.getByRole("region", { name: "Lease remaining" });
    expect(lease).toHaveTextContent("100 days left");
    expect(within(lease).getByRole("button", { name: "Remind me in my calendar" })).toBeInTheDocument();
    expect(within(lease).queryByText("Call the landlord")).not.toBeInTheDocument();
  });

  it("does not show the documents group when no lease date was found", () => {
    show({ initial: [reminder()] });

    expect(screen.queryByText("From your documents")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lease remaining" })).not.toBeInTheDocument();
  });

  it("says when the reminders could not be loaded, and does not pretend there are none", () => {
    show({ loadFailed: true });

    expect(screen.getByText(/could not be loaded just now/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/)).not.toBeInTheDocument();
  });

  it("shows when each reminder is due, and flags one that is overdue", () => {
    show({
      initial: [
        reminder({ id: "a", title: "Soon", dueDate: "2026-11-18", dueTime: "09:30" }),
        reminder({ id: "b", title: "Missed", dueDate: "2026-11-10" }),
      ],
    });

    expect(screen.getByText("Tomorrow · Wed, Nov 18 · 9:30 AM")).toBeInTheDocument();
    const overdue = screen.getByText("Overdue by 7 days · Tue, Nov 10");
    expect(overdue).toHaveClass("text-destructive");
  });

  it("puts what is overdue first, and links a reminder to its document", () => {
    show({
      initial: [
        reminder({ id: "a", title: "Later", dueDate: "2026-12-01", documentId: "d1", documentName: "lease.pdf" }),
        reminder({ id: "b", title: "Earlier", dueDate: "2026-11-01" }),
      ],
    });

    const titles = screen.getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent);
    expect(titles).toEqual(["Earlier", "Later"]);
    expect(screen.getByRole("link", { name: "lease.pdf" })).toHaveAttribute("href", "/dashboard/documents/d1");
  });

  it("shows the first five, and the rest on request", async () => {
    const user = userEvent.setup();
    show({ initial: Array.from({ length: 7 }, (_, i) => reminder({ id: `r${i}`, title: `Item ${i}`, dueDate: `2026-12-0${i + 1}` })) });

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
});

describe("adding a reminder", () => {
  it("opens a window with the fields, marks what is required, and says Brief sends no alerts", async () => {
    const user = userEvent.setup();
    show();

    await openAdd(user);

    const form = inDialog();
    expect(dialog()).toHaveAttribute("open");
    expect(form.getByRole("heading", { name: "Add a reminder" })).toBeInTheDocument();
    expect(form.getByLabelText(/Title/)).toHaveAttribute("aria-required", "true");
    expect(form.getByLabelText(/Date/)).toHaveValue(TODAY);
    expect(form.getByLabelText(/Time/)).toHaveValue("");
    expect(form.getByLabelText(/Description/)).toBeInTheDocument();
    expect(form.getByLabelText(/Linked document/)).toHaveValue("");
    expect(form.getByText(/does not send alerts or notifications/)).toBeInTheDocument();
    expect(form.getByLabelText(/Title/)).toHaveFocus();
  });

  it("lets a reminder be linked to one of the person's documents, or to none", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);

    const options = within(inDialog().getByLabelText(/Linked document/)).getAllByRole("option").map((option) => option.textContent);

    expect(options).toEqual(["None, just a reminder", "lease.pdf", "loan.pdf"]);
  });

  it("does not offer documents when there are none", async () => {
    const user = userEvent.setup();
    show({ documents: [] });
    await openAdd(user);

    expect(inDialog().getByLabelText(/Linked document/)).toBeDisabled();
    expect(inDialog().getByText("No documents yet")).toBeInTheDocument();
  });

  it("saves a reminder that has no document, shows it, closes the window and says so", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(201, wire(reminder({ id: "new", title: "Renew the lease", dueDate: "2026-12-05" }))));
    show();
    await openAdd(user);

    await user.type(inDialog().getByLabelText(/Title/), "  Renew the lease ");
    fireEvent.change(inDialog().getByLabelText(/Date/), { target: { value: "2026-12-05" } });
    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/me/reminders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "Renew the lease", due_date: "2026-12-05", due_time: null, description: null, document_id: null });
    expect(await screen.findByText("Renew the lease")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reminder added.");
  });

  it("saves the time, the description and the document when they are given", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(201, wire(reminder({ dueTime: "14:15", description: "Bring the lease", documentId: "d2", documentName: "loan.pdf" }))));
    show();
    await openAdd(user);

    await user.type(inDialog().getByLabelText(/Title/), "Call the bank");
    fireEvent.change(inDialog().getByLabelText(/Time/), { target: { value: "14:15" } });
    await user.type(inDialog().getByLabelText(/Description/), "Bring the lease");
    await user.selectOptions(inDialog().getByLabelText(/Linked document/), "d2");
    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      title: "Call the bank",
      due_date: TODAY,
      due_time: "14:15",
      description: "Bring the lease",
      document_id: "d2",
    });
    expect(await screen.findByRole("link", { name: "loan.pdf" })).toBeInTheDocument();
  });

  it("will not send a reminder without a title, says why beside the field, and puts the cursor there", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    expect(inDialog().getByRole("alert")).toHaveTextContent("Give the reminder a title.");
    expect(inDialog().getByLabelText(/Title/)).toHaveAttribute("aria-invalid", "true");
    expect(inDialog().getByLabelText(/Title/)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dialog()).toHaveAttribute("open");
  });

  it("will not send a reminder with no date or an impossible one, and clears the message when the field is fixed", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "x");

    fireEvent.change(inDialog().getByLabelText(/Date/), { target: { value: "" } });
    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));
    expect(inDialog().getByRole("alert")).toHaveTextContent("Choose a date.");
    expect(inDialog().getByLabelText(/Date/)).toHaveFocus();

    fireEvent.change(inDialog().getByLabelText(/Date/), { target: { value: "2026-12-05" } });
    expect(inDialog().queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops a title that is too long from being typed", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);

    expect(inDialog().getByLabelText(/Title/)).toHaveAttribute("maxlength", "120");
    expect(inDialog().getByLabelText(/Description/)).toHaveAttribute("maxlength", "500");
  });

  it("sends a reminder once, however many times Add is pressed while it is waiting", async () => {
    const user = userEvent.setup();
    let finish: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "Once only");

    const add = inDialog().getByRole("button", { name: "Add reminder" });
    await user.click(add);
    expect(inDialog().getByRole("button", { name: "Saving..." })).toBeDisabled();
    fireEvent.submit(inDialog().getByLabelText(/Title/).closest("form")!);
    fireEvent.submit(inDialog().getByLabelText(/Title/).closest("form")!);
    finish(new Response(JSON.stringify(wire(reminder({ id: "n", title: "Once only" }))), { status: 201 }));

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Once only")).toHaveLength(1);
  });

  it("keeps the window open and says what the server refused, so the person can try again", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(409, { detail: "You can keep up to 200 reminders. Delete one to add another." }));
    fetchMock.mockReturnValueOnce(answer(201, wire(reminder({ title: "Second try" }))));
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "Second try");

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));
    expect(await inDialog().findByRole("alert")).toHaveTextContent("You can keep up to 200 reminders");
    expect(dialog()).toHaveAttribute("open");
    expect(inDialog().getByLabelText(/Title/)).toHaveValue("Second try");
    expect(screen.queryByText("Reminder added.")).not.toBeInTheDocument();

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));
    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says plainly when Brief could not be reached, and never shows technical detail", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "x");

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    const problem = await inDialog().findByRole("alert");
    expect(problem).toHaveTextContent("Could not reach Brief. Check your connection and try again.");
    expect(problem).not.toHaveTextContent(/Failed to fetch/);
  });

  it("tells a signed out person to sign in again", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(401, { detail: "invalid token" }));
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "x");

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    expect(await inDialog().findByRole("alert")).toHaveTextContent("Sign in again");
  });

  it("puts the window away without saving when Cancel or Close is pressed", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "Never saved");

    await user.click(inDialog().getByRole("button", { name: "Cancel" }));
    expect(dialog()).not.toHaveAttribute("open");
    await openAdd(user);
    expect(inDialog().getByLabelText(/Title/)).toHaveValue("");
    await user.click(inDialog().getByRole("button", { name: "Close" }));

    expect(dialog()).not.toHaveAttribute("open");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Never saved")).not.toBeInTheDocument();
  });

  it("puts the window away when the area outside it is clicked", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);

    fireEvent.click(dialog());

    expect(dialog()).not.toHaveAttribute("open");
  });
});

describe("changing, finishing and deleting a reminder", () => {
  it("opens the reminder in the same window, filled in, and saves only what is changed", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(200, wire(reminder({ title: "Call the landlord today", dueTime: "08:00" }))));
    show({ initial: [reminder({ description: "about the deposit" })] });

    await user.click(screen.getByRole("button", { name: "Edit reminder: Call the landlord" }));
    const form = inDialog();
    expect(form.getByRole("heading", { name: "Edit reminder" })).toBeInTheDocument();
    expect(form.getByLabelText(/Title/)).toHaveValue("Call the landlord");
    expect(form.getByLabelText(/Date/)).toHaveValue("2026-11-20");
    expect(form.getByLabelText(/Description/)).toHaveValue("about the deposit");

    await user.type(form.getByLabelText(/Title/), " today");
    fireEvent.change(form.getByLabelText(/Time/), { target: { value: "08:00" } });
    await user.click(form.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/backend/me/reminders/r1");
    expect(init.method).toBe("PATCH");
    expect(await screen.findByText("Call the landlord today")).toBeInTheDocument();
    expect(screen.queryByText("Call the landlord")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reminder updated.");
  });

  it("will not make a new reminder for a day that has passed, and says so beside the date", async () => {
    const user = userEvent.setup();
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "Too late");

    fireEvent.change(inDialog().getByLabelText(/Date/), { target: { value: "2026-11-01" } });
    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    expect(inDialog().getByRole("alert")).toHaveTextContent("Choose today or a later date.");
    expect(inDialog().getByLabelText(/Date/)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a change to an overdue reminder without forcing a new date", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(200, wire(reminder({ dueDate: "2026-11-01", title: "Still overdue, renamed" }))));
    show({ initial: [reminder({ dueDate: "2026-11-01" })] });

    await user.click(screen.getByRole("button", { name: "Edit reminder: Call the landlord" }));
    await user.type(inDialog().getByLabelText(/Title/), "{End}, renamed");
    await user.click(inDialog().getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).due_date).toBe("2026-11-01");
  });

  it("lets a reminder that is overdue be edited without being forced to pick a new date", async () => {
    const user = userEvent.setup();
    show({ initial: [reminder({ dueDate: "2026-11-01" })] });

    await user.click(screen.getByRole("button", { name: "Edit reminder: Call the landlord" }));

    expect(inDialog().getByLabelText(/Date/)).toHaveValue("2026-11-01");
    expect(inDialog().getByLabelText(/Date/)).not.toHaveAttribute("min");
  });

  it("marks a reminder done, moves it out of the list, and brings it back", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(200, wire(reminder({ completed: true }))));
    fetchMock.mockReturnValueOnce(answer(200, wire(reminder({ completed: false }))));
    show({ initial: [reminder()] });

    await user.click(screen.getByRole("button", { name: "Mark as done: Call the landlord" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Show done (1)" })).toBeInTheDocument());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ completed: true });
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText("Everything is done.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Marked as done.");

    await user.click(screen.getByRole("button", { name: "Show done (1)" }));
    const undo = screen.getByRole("button", { name: "Mark as not done: Call the landlord" });
    expect(undo).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Call the landlord")).toHaveClass("line-through");
    await user.click(undo);

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ completed: false });
    expect(screen.queryByRole("button", { name: /Show done/ })).not.toBeInTheDocument();
  });

  it("leaves a reminder as it was and says so when finishing it fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(502, { detail: "could not reach the reading service" }));
    show({ initial: [reminder()] });

    await user.click(screen.getByRole("button", { name: "Mark as done: Call the landlord" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our side");
    expect(screen.getByRole("button", { name: "Mark as done: Call the landlord" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("asks before deleting, and deleting can be called off", async () => {
    const user = userEvent.setup();
    show({ initial: [reminder()] });

    await user.click(screen.getByRole("button", { name: "Delete reminder: Call the landlord" }));
    const confirm = screen.getByRole("group", { name: "Delete Call the landlord?" });
    expect(confirm).toHaveTextContent("Delete this reminder?");
    await user.click(within(confirm).getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Call the landlord")).toBeInTheDocument();
  });

  it("deletes a reminder once it is confirmed", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(204));
    show({ initial: [reminder(), reminder({ id: "r2", title: "Other" })] });

    await user.click(screen.getByRole("button", { name: "Delete reminder: Call the landlord" }));
    await user.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Call the landlord")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/me/reminders/r1", expect.objectContaining({ method: "DELETE" }));
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reminder deleted.");
  });

  it("keeps a reminder and says so when it could not be deleted", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(404, { detail: "reminder not found" }));
    show({ initial: [reminder()] });

    await user.click(screen.getByRole("button", { name: "Delete reminder: Call the landlord" }));
    await user.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That reminder no longer exists. Refresh the page.");
    expect(screen.getByText("Call the landlord")).toBeInTheDocument();
  });

  it("says so, and not that something is missing, when the server does not have reminders yet", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(404, { detail: "Not Found" }));
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "While the server updates");

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    expect(await inDialog().findByRole("alert")).toHaveTextContent("Reminders are not available right now. Please try again in a few minutes.");
    expect(dialog()).toHaveAttribute("open");
    expect(inDialog().getByLabelText(/Title/)).toHaveValue("While the server updates");
  });

  it("says the document could not be found, when that is what the server says", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(answer(404, { detail: "document not found" }));
    show();
    await openAdd(user);
    await user.type(inDialog().getByLabelText(/Title/), "Linked");
    await user.selectOptions(inDialog().getByLabelText(/Linked document/), "d1");

    await user.click(inDialog().getByRole("button", { name: "Add reminder" }));

    expect(await inDialog().findByRole("alert")).toHaveTextContent("That document could not be found");
  });
});
