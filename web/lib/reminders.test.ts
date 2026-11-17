import { describe, expect, it } from "vitest";

import {
  asReminders,
  emptyForm,
  errorText,
  formatDate,
  formatTime,
  formFromReminder,
  MAX_DESCRIPTION,
  MAX_TITLE,
  parseISODate,
  splitReminders,
  toRequestBody,
  validateReminder,
  whenText,
  type Reminder,
  type ReminderForm,
} from "@/lib/reminders";

const TODAY = { year: 2026, month: 11, day: 17 };
const make = (over: Partial<Reminder> = {}): Reminder => ({
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
const form = (over: Partial<ReminderForm> = {}): ReminderForm => ({ title: "Call", date: "2026-11-20", time: "", description: "", documentId: "", ...over });

describe("asReminders", () => {
  it("turns what the backend sent into reminders", () => {
    const [one] = asReminders([
      { id: "a", title: "Renew", description: "note", due_date: "2026-12-01", due_time: "09:30", document_id: "d", document_name: "lease.pdf", completed: true },
    ]);

    expect(one).toEqual({ id: "a", title: "Renew", description: "note", dueDate: "2026-12-01", dueTime: "09:30", documentId: "d", documentName: "lease.pdf", completed: true });
  });

  it("gives an empty list when the answer is not a list, and leaves out anything that is not a reminder", () => {
    expect(asReminders(null)).toEqual([]);
    expect(asReminders({ reminders: [] })).toEqual([]);
    expect(asReminders([null, "x", 5, { id: "a" }, { id: "a", title: "x", due_date: "2026-02-30" }, { id: "b", title: "ok", due_date: "2026-02-03" }])).toHaveLength(1);
  });

  it("treats a missing note, time or document as none", () => {
    const [one] = asReminders([{ id: "a", title: "x", due_date: "2026-02-03", description: "", due_time: "9am", document_id: null }]);

    expect(one.description).toBeNull();
    expect(one.dueTime).toBeNull();
    expect(one.documentId).toBeNull();
    expect(one.completed).toBe(false);
  });
});

describe("parseISODate", () => {
  it("reads a real day", () => {
    expect(parseISODate("2026-03-09")).toEqual({ year: 2026, month: 3, day: 9 });
    expect(parseISODate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-1-5", "03/09/2026", "", "tomorrow"])("refuses %j", (text) => {
    expect(parseISODate(text)).toBeNull();
  });
});

describe("validateReminder", () => {
  it("finds nothing wrong with a good reminder, with or without the optional parts", () => {
    expect(validateReminder(form(), TODAY)).toEqual({});
    expect(validateReminder(form({ time: "09:30", description: "note", documentId: "d" }), TODAY)).toEqual({});
  });

  it("needs a title, and a title of more than just spaces", () => {
    expect(validateReminder(form({ title: "" }), TODAY).title).toBe("Give the reminder a title.");
    expect(validateReminder(form({ title: "   " }), TODAY).title).toBe("Give the reminder a title.");
  });

  it("limits the title and the description", () => {
    expect(validateReminder(form({ title: "x".repeat(MAX_TITLE) }), TODAY).title).toBeUndefined();
    expect(validateReminder(form({ title: "x".repeat(MAX_TITLE + 1) }), TODAY).title).toContain(String(MAX_TITLE));
    expect(validateReminder(form({ description: "y".repeat(MAX_DESCRIPTION + 1) }), TODAY).description).toContain(String(MAX_DESCRIPTION));
  });

  it("needs a real date, and one that is not a slip of the keyboard", () => {
    expect(validateReminder(form({ date: "" }), TODAY).date).toBe("Choose a date.");
    expect(validateReminder(form({ date: "2026-02-30" }), TODAY).date).toContain("not a real date");
    expect(validateReminder(form({ date: "0026-05-05" }), TODAY).date).toContain("between 2000 and 2036");
    expect(validateReminder(form({ date: "2206-05-05" }), TODAY).date).toContain("between 2000 and 2036");
  });

  it("will not make a new reminder for a day that has passed, but allows today", () => {
    expect(validateReminder(form({ date: "2026-11-16" }), TODAY).date).toBe("Choose today or a later date.");
    expect(validateReminder(form({ date: "2026-01-01" }), TODAY).date).toBe("Choose today or a later date.");
    expect(validateReminder(form({ date: "2026-11-17" }), TODAY)).toEqual({});
  });

  it("lets a reminder that is already overdue be edited, keeping its own date but not moving to another day that has passed", () => {
    expect(validateReminder(form({ date: "2026-11-01" }), TODAY, "2026-11-01")).toEqual({});
    expect(validateReminder(form({ date: "2026-11-05" }), TODAY, "2026-11-01").date).toBe("Choose today or a later date.");
    expect(validateReminder(form({ date: "2026-12-05" }), TODAY, "2026-11-01")).toEqual({});
  });

  it("checks the time only when there is one", () => {
    expect(validateReminder(form({ time: "" }), TODAY).time).toBeUndefined();
    expect(validateReminder(form({ time: "23:59" }), TODAY).time).toBeUndefined();
    expect(validateReminder(form({ time: "24:00" }), TODAY).time).toContain("not a real time");
    expect(validateReminder(form({ time: "9:5" }), TODAY).time).toContain("not a real time");
  });

  it("reports every problem at once", () => {
    expect(Object.keys(validateReminder(form({ title: "", date: "", time: "99:99" }), TODAY)).sort()).toEqual(["date", "time", "title"]);
  });
});

describe("the form and the request", () => {
  it("starts today, with nothing else filled in", () => {
    expect(emptyForm(TODAY)).toEqual({ title: "", date: "2026-11-17", time: "", description: "", documentId: "" });
  });

  it("makes a request with the text tidied and the empty optional parts as null", () => {
    expect(toRequestBody(form({ title: "  Call  ", description: "  ", time: "", documentId: "" }))).toEqual({
      title: "Call",
      due_date: "2026-11-20",
      due_time: null,
      description: null,
      document_id: null,
    });
    expect(toRequestBody(form({ time: "09:30", description: " note ", documentId: "d1" }))).toMatchObject({ due_time: "09:30", description: "note", document_id: "d1" });
  });

  it("fills the form from an existing reminder", () => {
    expect(formFromReminder(make({ dueTime: "08:00", description: "n", documentId: "d" }))).toEqual({
      title: "Call the landlord",
      date: "2026-11-20",
      time: "08:00",
      description: "n",
      documentId: "d",
    });
    expect(formFromReminder(make()).time).toBe("");
  });
});

describe("how a reminder reads", () => {
  it("writes the date the same way everywhere, adding the year only when it is not this year", () => {
    expect(formatDate("2026-11-18", TODAY)).toBe("Wed, Nov 18");
    expect(formatDate("2027-01-05", TODAY)).toBe("Tue, Jan 5, 2027");
    expect(formatDate("nonsense", TODAY)).toBe("nonsense");
  });

  it("writes the time with AM and PM", () => {
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("09:30")).toBe("9:30 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("17:45")).toBe("5:45 PM");
  });

  it("says how soon it is", () => {
    expect(whenText(make({ dueDate: "2026-11-17" }), TODAY).text).toBe("Today · Tue, Nov 17");
    expect(whenText(make({ dueDate: "2026-11-18", dueTime: "09:30" }), TODAY).text).toBe("Tomorrow · Wed, Nov 18 · 9:30 AM");
    expect(whenText(make({ dueDate: "2026-11-20" }), TODAY).text).toBe("In 3 days · Fri, Nov 20");
    expect(whenText(make({ dueDate: "2026-12-30" }), TODAY).text).toBe("Wed, Dec 30");
  });

  it("flags what is overdue, and never flags what is done", () => {
    expect(whenText(make({ dueDate: "2026-11-16" }), TODAY)).toEqual({ text: "Overdue by a day · Mon, Nov 16", overdue: true });
    expect(whenText(make({ dueDate: "2026-11-10" }), TODAY)).toEqual({ text: "Overdue by 7 days · Tue, Nov 10", overdue: true });
    expect(whenText(make({ dueDate: "2026-11-10", completed: true }), TODAY)).toEqual({ text: "Tue, Nov 10", overdue: false });
    expect(whenText(make({ dueDate: "2026-11-17" }), TODAY).overdue).toBe(false);
  });
});

describe("splitReminders", () => {
  it("puts what is to do soonest first, the overdue ahead of the rest, and a timed one before an untimed one on the same day", () => {
    const { open } = splitReminders([
      make({ id: "late", dueDate: "2026-12-01" }),
      make({ id: "untimed", dueDate: "2026-11-20" }),
      make({ id: "timed", dueDate: "2026-11-20", dueTime: "08:00" }),
      make({ id: "overdue", dueDate: "2026-11-01" }),
    ]);

    expect(open.map((r) => r.id)).toEqual(["overdue", "timed", "untimed", "late"]);
  });

  it("keeps what is done apart, the most recent first", () => {
    const { open, done } = splitReminders([
      make({ id: "a", dueDate: "2026-11-01", completed: true }),
      make({ id: "b", dueDate: "2026-11-09", completed: true }),
      make({ id: "c" }),
    ]);

    expect(open.map((r) => r.id)).toEqual(["c"]);
    expect(done.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("does not change the list it was given", () => {
    const list = [make({ id: "b", dueDate: "2026-12-01" }), make({ id: "a", dueDate: "2026-11-01" })];

    splitReminders(list);

    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("errorText", () => {
  const answer = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  it("shows the sentence the backend wrote for a refusal the person can act on", async () => {
    expect(await errorText(answer(422, { detail: "Give the reminder a title." }))).toBe("Give the reminder a title.");
    expect(await errorText(answer(409, { detail: "You can keep up to 200 reminders. Delete one to add another." }))).toContain("200 reminders");
  });

  it("explains the cases that need it, and never shows technical detail", async () => {
    expect(await errorText(answer(401, { detail: "invalid token" }))).toContain("Sign in again");
    expect(await errorText(answer(404, { detail: "reminder not found" }))).toBe("That reminder no longer exists. Refresh the page.");
    expect(await errorText(answer(404, { detail: "document not found" }))).toContain("That document could not be found");
    // The API answers "Not Found" for a route it does not have, which is what a new website sees from a server not yet updated.
    expect(await errorText(answer(404, { detail: "Not Found" }))).toBe("Reminders are not available right now. Please try again in a few minutes.");
    expect(await errorText(answer(404, "<html>not found</html>"))).toContain("not available right now");
    expect(await errorText(answer(422, { detail: [{ loc: ["body", "due_date"], msg: "bad" }] }))).toContain("check the reminder");
    expect(await errorText(answer(502, { detail: "could not reach the reading service" }))).toBe("Something went wrong on our side. Please try again in a moment.");
    expect(await errorText(answer(500, "<html>boom</html>"))).toBe("Something went wrong on our side. Please try again in a moment.");
  });
});
