/** The numbers the admin page shows. All of them are counts or totals: none names a person, an address or a document. */
export type AdminDay = { day: string; signed_up: number; people: number; minutes: number };

export type AdminStats = {
  generated_at: string;
  people: { total: number; new_7_days: number; new_30_days: number; active_today: number; active_7_days: number; active_30_days: number };
  time_in_brief: { average_minutes_per_person_per_day_7_days: number; average_minutes_per_visit_7_days: number; visits_7_days: number };
  documents: { stored: number; uploaded_7_days: number; uploaded_30_days: number; by_kind: Record<string, number>; by_status: Record<string, number>; photos: number; pdfs_and_other: number };
  questions: { asked_total: number; asked_today: number; asked_7_days: number };
  reads: { total: number; today: number };
  overviews: { total: number; today: number };
  reasons: Record<string, number>;
  sharing: { waiting_or_active: number; active: number };
  site: { model_calls_today: number; daily_limit: number };
  by_day: AdminDay[];
};

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const record = (value: unknown): Record<string, number> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, count]) => [key, num(count)]))
    : {};
const object = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

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
  return {
    generated_at: stats.generated_at,
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
    by_day: Array.isArray(stats.by_day)
      ? stats.by_day.flatMap((entry) => {
          const row = object(entry);
          return typeof row.day === "string" ? [{ day: row.day, signed_up: num(row.signed_up), people: num(row.people), minutes: num(row.minutes) }] : [];
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
