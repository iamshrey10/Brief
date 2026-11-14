/** The numbers the admin page shows. All of them are counts or totals: none names a person, an address or a document. */
import { buildPdf } from "@/lib/pdf";
import type { SummaryBlock } from "@/lib/summary-text";

/** What was counted on one day. Every number is a total, never a person. */
export type AdminDay = {
  day: string;
  signed_up: number;
  people: number;
  visits: number;
  minutes: number;
  documents: number;
  questions: number;
  reads: number;
  overviews: number;
  demo_opened: number;
  demo_finished: number;
};

/** The sums over a stretch of days, such as the last 30. `people` is how many different people were active, not a sum of each day's. */
export type AdminPeriod = Omit<AdminDay, "day"> & { average_minutes_per_visit: number };
export type AdminFunnel = { signed_up: number; uploaded_a_document: number; asked_a_question: number; came_back_another_day: number; shared_their_dashboard: number };
export type AdminDemo = { opened_total: number; finished_total: number; opened_7_days: number; finished_7_days: number; opened_30_days: number; finished_30_days: number };

/** The lengths of time the page can show, in days. */
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export type AdminStats = {
  generated_at: string;
  range_days: number;
  people: { total: number; new_7_days: number; new_30_days: number; active_today: number; active_7_days: number; active_30_days: number };
  time_in_brief: { average_minutes_per_person_per_day_7_days: number; average_minutes_per_visit_7_days: number; visits_7_days: number };
  documents: { stored: number; uploaded_7_days: number; uploaded_30_days: number; by_kind: Record<string, number>; by_status: Record<string, number>; photos: number; pdfs_and_other: number };
  questions: { asked_total: number; asked_today: number; asked_7_days: number };
  reads: { total: number; today: number };
  overviews: { total: number; today: number };
  reasons: Record<string, number>;
  sharing: { waiting_or_active: number; active: number };
  site: { model_calls_today: number; daily_limit: number };
  funnel: AdminFunnel;
  demo: AdminDemo;
  period: { current: AdminPeriod; previous: AdminPeriod };
  by_day: AdminDay[];
};

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const record = (value: unknown): Record<string, number> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, count]) => [key, num(count)]))
    : {};
const object = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const DAY_FIELDS = ["signed_up", "people", "visits", "minutes", "documents", "questions", "reads", "overviews", "demo_opened", "demo_finished"] as const;

function day(entry: Record<string, unknown>, label: string): AdminDay {
  const out = { day: label } as AdminDay;
  for (const field of DAY_FIELDS) out[field] = num(entry[field]);
  return out;
}

function period(value: unknown): AdminPeriod {
  const entry = object(value);
  const { day: _ignored, ...fields } = day(entry, "");
  void _ignored;
  return { ...fields, average_minutes_per_visit: num(entry.average_minutes_per_visit) };
}

/** The numbers the backend sent, or null when the answer is not them. Anything missing counts as nothing. */
export function asAdminStats(body: unknown): AdminStats | null {
  const stats = object(body);
  if (typeof stats.generated_at !== "string") return null;
  const people = object(stats.people);
  const time = object(stats.time_in_brief);
  const documents = object(stats.documents);
  const questions = object(stats.questions);
  const reads = object(stats.reads);
  const overviews = object(stats.overviews);
  const sharing = object(stats.sharing);
  const site = object(stats.site);
  const funnel = object(stats.funnel);
  const demo = object(stats.demo);
  const periods = object(stats.period);
  return {
    generated_at: stats.generated_at,
    range_days: num(stats.range_days) || 30,
    people: {
      total: num(people.total),
      new_7_days: num(people.new_7_days),
      new_30_days: num(people.new_30_days),
      active_today: num(people.active_today),
      active_7_days: num(people.active_7_days),
      active_30_days: num(people.active_30_days),
    },
    time_in_brief: {
      average_minutes_per_person_per_day_7_days: num(time.average_minutes_per_person_per_day_7_days),
      average_minutes_per_visit_7_days: num(time.average_minutes_per_visit_7_days),
      visits_7_days: num(time.visits_7_days),
    },
    documents: {
      stored: num(documents.stored),
      uploaded_7_days: num(documents.uploaded_7_days),
      uploaded_30_days: num(documents.uploaded_30_days),
      by_kind: record(documents.by_kind),
      by_status: record(documents.by_status),
      photos: num(documents.photos),
      pdfs_and_other: num(documents.pdfs_and_other),
    },
    questions: { asked_total: num(questions.asked_total), asked_today: num(questions.asked_today), asked_7_days: num(questions.asked_7_days) },
    reads: { total: num(reads.total), today: num(reads.today) },
    overviews: { total: num(overviews.total), today: num(overviews.today) },
    reasons: record(stats.reasons),
    sharing: { waiting_or_active: num(sharing.waiting_or_active), active: num(sharing.active) },
    site: { model_calls_today: num(site.model_calls_today), daily_limit: num(site.daily_limit) },
    funnel: {
      signed_up: num(funnel.signed_up),
      uploaded_a_document: num(funnel.uploaded_a_document),
      asked_a_question: num(funnel.asked_a_question),
      came_back_another_day: num(funnel.came_back_another_day),
      shared_their_dashboard: num(funnel.shared_their_dashboard),
    },
    demo: {
      opened_total: num(demo.opened_total),
      finished_total: num(demo.finished_total),
      opened_7_days: num(demo.opened_7_days),
      finished_7_days: num(demo.finished_7_days),
      opened_30_days: num(demo.opened_30_days),
      finished_30_days: num(demo.finished_30_days),
    },
    period: { current: period(periods.current), previous: period(periods.previous) },
    by_day: Array.isArray(stats.by_day)
      ? stats.by_day.flatMap((entry) => {
          const row = object(entry);
          return typeof row.day === "string" ? [day(row, row.day)] : [];
        })
      : [],
  };
}

const REASON_LABELS: Record<string, string> = {
  lease: "Check a lease",
  loan: "Understand a loan",
  job_offer: "Review a job offer",
  exploring: "Just looking around",
  not_said: "Did not say",
};
const KIND_LABELS: Record<string, string> = { lease: "Leases", loan: "Education loans", offer: "Job offers", other: "Other" };
const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  processing: "Being read",
  uploaded: "Waiting to be read",
  pending: "Upload not finished",
  failed: "Failed",
  needs_retake: "Photo needs retaking",
};

export const reasonLabel = (key: string) => REASON_LABELS[key] ?? key;
export const kindLabel = (key: string) => KIND_LABELS[key] ?? key;
export const statusLabel = (key: string) => STATUS_LABELS[key] ?? key;

/** "0 min", "45 sec", "1.2 min" or "1 h 5 min": a time that is short, in the unit that reads best. */
export function minutesText(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
  const whole = Math.floor(minutes);
  return `${Math.floor(whole / 60)} h ${whole % 60} min`;
}

/** "Nov 12" from "2026-11-12", whichever time zone the reader is in. */
export function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The entries of a count by name, biggest first, with the share of the whole each is. */
export function ranked(counts: Record<string, number>): { key: string; count: number; share: number }[] {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count, share: total === 0 ? 0 : count / total }));
}

/** How a number changed from the stretch before to this one, as the page says it: a share, and which way. Nothing before gives no share to quote. */
export function change(current: number, previous: number): { direction: "up" | "down" | "flat" | "new"; text: string } {
  if (current === previous) return { direction: "flat", text: "No change" };
  if (previous === 0) return { direction: "new", text: "New" };
  const share = Math.round(((current - previous) / previous) * 100);
  if (share === 0) return { direction: current > previous ? "up" : "down", text: current > previous ? "+<1%" : "-<1%" };
  return { direction: share > 0 ? "up" : "down", text: `${share > 0 ? "+" : ""}${share}%` };
}

/** A share as a whole percent, or "none yet" when there was nothing to take a share of. */
export function percentText(part: number, whole: number): string {
  return whole <= 0 ? "None yet" : `${Math.round((part / whole) * 100)}%`;
}

/** What a report holds: counts for one day or one month, never a person. */
export type AdminReport = {
  period: "day" | "month";
  label: string;
  from: string;
  to: string;
  generated_at: string;
  totals: AdminPeriod;
  reasons_of_new_people: Record<string, number>;
  by_day: AdminDay[];
};

export function asAdminReport(body: unknown): AdminReport | null {
  const report = object(body);
  if ((report.period !== "day" && report.period !== "month") || typeof report.label !== "string" || typeof report.from !== "string" || typeof report.to !== "string") return null;
  return {
    period: report.period,
    label: report.label,
    from: report.from,
    to: report.to,
    generated_at: typeof report.generated_at === "string" ? report.generated_at : "",
    totals: period(report.totals),
    reasons_of_new_people: record(report.reasons_of_new_people),
    by_day: Array.isArray(report.by_day) ? report.by_day.flatMap((entry) => (typeof object(entry).day === "string" ? [day(object(entry), object(entry).day as string)] : [])) : [],
  };
}

/** The lines of a report, in the order both the file and the PDF show them: a label and a value. */
export function reportRows(totals: AdminPeriod): [string, string][] {
  return [
    ["New people", String(totals.signed_up)],
    ["Active people", String(totals.people)],
    ["Visits", String(totals.visits)],
    ["Minutes in Brief", String(totals.minutes)],
    ["Average minutes per visit", String(totals.average_minutes_per_visit)],
    ["Documents uploaded", String(totals.documents)],
    ["Questions asked", String(totals.questions)],
    ["Documents read", String(totals.reads)],
    ["Overviews made", String(totals.overviews)],
    ["Demo video opened", String(totals.demo_opened)],
    ["Demo video watched to the end", String(totals.demo_finished)],
  ];
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** A report as a CSV file that opens in a spreadsheet: the totals, why the new people came, then a row for each day. */
export function reportCsv(report: AdminReport): string {
  const lines: string[] = [
    ["Brief report", report.period === "day" ? "Day" : "Month", report.label].map(csvCell).join(","),
    ["From", report.from, "To", report.to].map(csvCell).join(","),
    "",
    "Totals",
    ...reportRows(report.totals).map(([label, value]) => [label, value].map(csvCell).join(",")),
    "",
    "Why the new people came",
    ...(Object.keys(report.reasons_of_new_people).length === 0
      ? ["None signed up in this time"]
      : ranked(report.reasons_of_new_people).map(({ key, count }) => [reasonLabel(key), String(count)].map(csvCell).join(","))),
    "",
    "By day",
    ["Day", "New people", "Active people", "Visits", "Minutes", "Documents", "Questions", "Reads", "Overviews", "Demo opened", "Demo finished"].join(","),
    ...report.by_day.map((d) => [d.day, d.signed_up, d.people, d.visits, d.minutes, d.documents, d.questions, d.reads, d.overviews, d.demo_opened, d.demo_finished].join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** A report as a PDF a person can read or print: the totals, why new people came, and a line for each day. */
export function reportPdf(report: AdminReport): Uint8Array {
  const title = `Brief ${report.period === "day" ? "daily" : "monthly"} report, ${report.label}`;
  const blocks: SummaryBlock[] = [
    { kind: "title", text: title },
    { kind: "note", text: `${report.from === report.to ? report.from : `${report.from} to ${report.to}`}. Counts only: no person, document or question is named in this report.` },
    { kind: "heading", text: "Totals" },
    ...reportRows(report.totals).map(([label, value]): SummaryBlock => ({ kind: "bullet", text: `${label}: ${value}` })),
    { kind: "heading", text: "Why the new people came" },
    ...(Object.keys(report.reasons_of_new_people).length === 0
      ? [{ kind: "paragraph", text: "None signed up in this time." } as SummaryBlock]
      : ranked(report.reasons_of_new_people).map(({ key, count }): SummaryBlock => ({ kind: "bullet", text: `${reasonLabel(key)}: ${count}` }))),
    { kind: "heading", text: "By day" },
    ...report.by_day.map((d): SummaryBlock => ({
      kind: "paragraph",
      text: `${shortDay(d.day)}: ${d.signed_up} new, ${d.people} active, ${d.minutes} min, ${d.documents} documents, ${d.questions} questions, demo ${d.demo_opened} opened and ${d.demo_finished} finished`,
    })),
  ];
  return buildPdf(blocks, title);
}

/** The name a downloaded report is saved under. */
export function reportFileName(report: AdminReport, extension: "csv" | "pdf"): string {
  return `brief-${report.period === "day" ? "daily" : "monthly"}-report-${report.label}.${extension}`;
}
