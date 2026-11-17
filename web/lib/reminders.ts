import { daysBetween, localToday, toISODate, type PlainDate } from "@/lib/dates";

/** A reminder a person wrote for themselves. The date and time are their own wall clock, with no time zone. */
export type Reminder = {
  id: string;
  title: string;
  description: string | null;
  /** "2026-03-09" */
  dueDate: string;
  /** "09:30", or null when the reminder has a day and no time. */
  dueTime: string | null;
  documentId: string | null;
  documentName: string | null;
  completed: boolean;
};

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 500;
export const MAX_REMINDERS = 200;

/** What the form holds: the text exactly as typed. */
export type ReminderForm = { title: string; date: string; time: string; description: string; documentId: string };
export type ReminderProblems = Partial<Record<"title" | "date" | "time" | "description", string>>;

export const emptyForm = (today: PlainDate = localToday()): ReminderForm => ({
  title: "",
  date: toISODate(today),
  time: "",
  description: "",
  documentId: "",
});

/** The reminders the backend sent, or an empty list when it did not send a list. Anything that is not a reminder is left out. */
export function asReminders(body: unknown): Reminder[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((item): Reminder[] => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.title !== "string" || typeof r.due_date !== "string" || !parseISODate(r.due_date)) return [];
    return [
      {
        id: r.id,
        title: r.title,
        description: typeof r.description === "string" && r.description !== "" ? r.description : null,
        dueDate: r.due_date,
        dueTime: typeof r.due_time === "string" && /^\d{2}:\d{2}$/.test(r.due_time) ? r.due_time : null,
        documentId: typeof r.document_id === "string" ? r.document_id : null,
        documentName: typeof r.document_name === "string" ? r.document_name : null,
        completed: r.completed === true,
      },
    ];
  });
}

/** "2026-03-09" as a day, or null when it is not a real day (such as "2026-02-30") or not written that way. */
export function parseISODate(text: string): PlainDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // setUTCFullYear and not Date.UTC, which reads a year from 0 to 99 as 1900 to 1999 and would call "0026-05-05" a different day.
  const check = new Date(Date.UTC(2000, month - 1, day));
  check.setUTCFullYear(year, month - 1, day);
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return real ? { year, month, day } : null;
}

/**
 * What is wrong with the form, in words a person can act on. Nothing is wrong when the object comes back empty. A new reminder cannot be
 * for a day that has passed, which is almost always a slip. A reminder that is already overdue can still be edited, keeping its own date.
 */
export function validateReminder(form: ReminderForm, today: PlainDate = localToday(), currentDate: string | null = null): ReminderProblems {
  const problems: ReminderProblems = {};
  const title = form.title.trim();
  if (!title) problems.title = "Give the reminder a title.";
  else if (title.length > MAX_TITLE) problems.title = `Keep the title to ${MAX_TITLE} characters or fewer.`;

  const date = parseISODate(form.date);
  if (!form.date.trim()) problems.date = "Choose a date.";
  else if (!date) problems.date = "That is not a real date. Choose one from the calendar.";
  else if (date.year < 2000 || date.year > today.year + 10) problems.date = `Choose a date between 2000 and ${today.year + 10}.`;
  else if (daysBetween(today, date) < 0 && form.date.trim() !== currentDate) problems.date = "Choose today or a later date.";

  if (form.time.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time.trim())) problems.time = "That is not a real time. Use hours and minutes, like 09:30.";
  if (form.description.trim().length > MAX_DESCRIPTION) problems.description = `Keep the description to ${MAX_DESCRIPTION} characters or fewer.`;
  return problems;
}

/** The request body for the backend. Only call this once validateReminder found nothing wrong. */
export function toRequestBody(form: ReminderForm) {
  return {
    title: form.title.trim(),
    due_date: form.date.trim(),
    due_time: form.time.trim() === "" ? null : form.time.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    document_id: form.documentId === "" ? null : form.documentId,
  };
}

export const formFromReminder = (reminder: Reminder): ReminderForm => ({
  title: reminder.title,
  date: reminder.dueDate,
  time: reminder.dueTime ?? "",
  description: reminder.description ?? "",
  documentId: reminder.documentId ?? "",
});

/** "Tue, Mar 3", with the year when it is not this year, in the same words on the server and in the browser. */
export function formatDate(iso: string, today: PlainDate = localToday()): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.year === today.year ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** "09:30" as "9:30 AM". */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** When a reminder is due, in the words a person would use, and whether it is overdue. A done reminder is never overdue. */
export function whenText(reminder: Reminder, today: PlainDate = localToday()): { text: string; overdue: boolean } {
  const date = parseISODate(reminder.dueDate);
  const days = date ? daysBetween(today, date) : 0;
  const overdue = !reminder.completed && days < 0;
  const parts: string[] = [];
  if (!reminder.completed) {
    if (days < 0) parts.push(days === -1 ? "Overdue by a day" : `Overdue by ${-days} days`);
    else if (days === 0) parts.push("Today");
    else if (days === 1) parts.push("Tomorrow");
    else if (days <= 14) parts.push(`In ${days} days`);
  }
  parts.push(formatDate(reminder.dueDate, today));
  if (reminder.dueTime) parts.push(formatTime(reminder.dueTime));
  return { text: parts.join(" · "), overdue };
}

const byDue = (a: Reminder, b: Reminder) =>
  a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") || a.title.localeCompare(b.title);

/** What is still to do, soonest first (overdue ones come first), and what is done, most recent first. */
export function splitReminders(list: Reminder[]): { open: Reminder[]; done: Reminder[] } {
  return {
    open: list.filter((reminder) => !reminder.completed).sort(byDue),
    done: list.filter((reminder) => reminder.completed).sort((a, b) => byDue(b, a)),
  };
}

/** What went wrong, from the answer to a request, as a sentence to show. Never shows raw technical detail. */
export async function errorText(response: Response): Promise<string> {
  let detail: unknown;
  try {
    detail = (await response.json())?.detail;
  } catch {
    detail = undefined;
  }
  if (response.status === 401) return "Your session has ended. Sign in again to continue.";
  if (response.status === 404) return "That reminder or document could not be found. Refresh the page and try again.";
  // A refusal the person can act on comes with a sentence written for them. Anything else is not shown as it is.
  if (typeof detail === "string" && detail.trim() !== "" && response.status < 500) return detail;
  if (response.status === 422) return "Please check the reminder's title, date and time, and try again.";
  if (response.status === 429) return "Too many requests. Wait a moment and try again.";
  return "Something went wrong on our side. Please try again in a moment.";
}
