import type { ReactNode } from "react";

import { kindLabel, minutesText, ranked, reasonLabel, shortDay, statusLabel, type AdminDay, type AdminStats } from "@/lib/admin";
import { cn } from "@/lib/utils";

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 id={id} className="font-heading text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function Stats({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </dl>
  );
}

/** A bar for every day, the tallest as high as the box. Each bar is also in a table for a screen reader. */
function DayChart({ title, days, pick, unit }: { title: string; days: AdminDay[]; pick: (day: AdminDay) => number; unit: string }) {
  const values = days.map(pick);
  const tallest = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    <figure className="min-w-0">
      <figcaption className="text-sm font-medium text-foreground">
        {title} <span className="font-normal text-muted-foreground">({total} in {days.length} days)</span>
      </figcaption>
      <div aria-hidden="true" className="mt-3 flex h-28 items-end gap-0.5 border-b border-border">
        {days.map((day, index) => (
          <div key={day.day} title={`${shortDay(day.day)}: ${values[index]} ${unit}`} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className={cn("w-full rounded-t-sm", values[index] > 0 ? "bg-primary" : "bg-border")}
              style={{ height: values[index] > 0 ? `${Math.max(6, (values[index] / tallest) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      {days.length > 0 && (
        <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{shortDay(days[0].day)}</span>
          <span>{shortDay(days[days.length - 1].day)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day, index) => (
            <tr key={day.day}>
              <th scope="row">{shortDay(day.day)}</th>
              <td>{values[index]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A count by name as bars, the biggest first, each with its number and its share of the whole. */
function BarList({ label, counts, name, empty }: { label: string; counts: Record<string, number>; name: (key: string) => string; empty: string }) {
  const rows = ranked(counts);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map(({ key, count, share }) => (
        <li key={key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{name(key)}</span>
            <span className="shrink-0 text-muted-foreground">
              <span className="font-medium text-foreground">{count}</span> · {Math.round(share * 100)}%
            </span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, share * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The owner's page: how Brief is being used, as counts. It never shows a document, a question or an answer, and never a name or an
 * address. Every number on it is a total.
 */
export function AdminDashboard({ stats }: { stats: AdminStats }) {
  const { people, time_in_brief: time, documents, questions, reads, overviews, sharing, site } = stats;
  const used = site.daily_limit > 0 ? Math.min(100, Math.round((site.model_calls_today / site.daily_limit) * 100)) : 0;
  return (
    <div className="flex flex-col gap-5">
      <Section id="admin-people" title="People" note="Everyone who has signed in with Google, and who has been using Brief.">
        <Stats label="People">
          <Stat label="Signed up" value={people.total} hint="Everyone with an account" />
          <Stat label="New this week" value={people.new_7_days} hint={`${people.new_30_days} in 30 days`} />
          <Stat label="Active today" value={people.active_today} hint="Had Brief open and in use" />
          <Stat label="Active this week" value={people.active_7_days} hint={`${people.active_30_days} in 30 days`} />
        </Stats>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <DayChart title="People active each day" days={stats.by_day} pick={(day) => day.people} unit="people" />
          <DayChart title="New sign-ups each day" days={stats.by_day} pick={(day) => day.signed_up} unit="sign-ups" />
        </div>
      </Section>

      <Section id="admin-time" title="Time in Brief" note="Counted while Brief is open, in front, and being used. A tab left open in the background adds nothing.">
        <Stats label="Time in Brief">
          <Stat label="Average visit" value={minutesText(time.average_minutes_per_visit_7_days)} hint="Last 7 days" />
          <Stat label="Per person, per day" value={minutesText(time.average_minutes_per_person_per_day_7_days)} hint="Of people who came, last 7 days" />
          <Stat label="Visits" value={time.visits_7_days} hint="Last 7 days" />
        </Stats>
        <div className="mt-6">
          <DayChart title="Minutes in Brief each day" days={stats.by_day} pick={(day) => Math.round(day.minutes)} unit="minutes" />
        </div>
      </Section>

      <Section id="admin-documents" title="Documents" note="What is stored now. A document in the Bin is not counted until it is gone for good.">
        <Stats label="Documents">
          <Stat label="Stored now" value={documents.stored} />
          <Stat label="Uploaded this week" value={documents.uploaded_7_days} hint={`${documents.uploaded_30_days} in 30 days`} />
          <Stat label="Photos" value={documents.photos} hint="Taken or chosen as pictures" />
          <Stat label="PDFs and other files" value={documents.pdfs_and_other} />
        </Stats>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium text-foreground">By kind</h3>
            <BarList label="Documents by kind" counts={documents.by_kind} name={kindLabel} empty="No documents yet." />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-foreground">By state</h3>
            <BarList label="Documents by state" counts={documents.by_status} name={statusLabel} empty="No documents yet." />
          </div>
        </div>
      </Section>

      <Section id="admin-questions" title="Questions, reads and overviews" note="Counted from each person's daily use, so a person who deletes their account takes their counts with them.">
        <Stats label="Questions, reads and overviews">
          <Stat label="Questions asked" value={questions.asked_total} hint={`${questions.asked_today} today · ${questions.asked_7_days} this week`} />
          <Stat label="Documents read" value={reads.total} hint={`${reads.today} today`} />
          <Stat label="Overviews made" value={overviews.total} hint={`${overviews.today} today`} />
        </Stats>
      </Section>

      <Section id="admin-reasons" title="Why people came" note="From the question on the welcome page, which can be skipped.">
        <BarList label="Why people came" counts={stats.reasons} name={reasonLabel} empty="Nobody has signed up yet." />
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section id="admin-sharing" title="Sharing">
          <Stats label="Sharing">
            <Stat label="Can view now" value={sharing.active} />
            <Stat label="Invited or waiting" value={sharing.waiting_or_active - sharing.active} />
          </Stats>
        </Section>
        <Section id="admin-model" title="The AI today" note="Brief stops starting new reads and questions for the day when it reaches its limit.">
          <p className="text-3xl font-semibold tracking-tight text-foreground">
            {site.model_calls_today} <span className="text-base font-normal text-muted-foreground">of {site.daily_limit} calls</span>
          </p>
          <div role="progressbar" aria-label="Share of today's limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} className="mt-3 h-2.5 overflow-hidden rounded-full bg-border">
            <div className={cn("h-full rounded-full", used >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(used, 1)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{used}% of today&apos;s limit</p>
        </Section>
      </div>
    </div>
  );
}
