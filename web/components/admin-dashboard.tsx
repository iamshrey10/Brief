import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminReports } from "@/components/admin-reports";
import { Funnel, LineChart, Sparkline } from "@/components/charts";
import { change, kindLabel, minutesText, percentText, ranked, RANGES, reasonLabel, statusLabel, type AdminDay, type AdminStats } from "@/lib/admin";
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

/** A number for the chosen stretch of days, how it changed from the stretch before, and its shape over the days. */
function Kpi({ label, value, current, previous, days, pick, days_label }: { label: string; value: ReactNode; current: number; previous: number; days: AdminDay[]; pick: (day: AdminDay) => number; days_label: string }) {
  const moved = change(current, previous);
  const Icon = moved.direction === "up" || moved.direction === "new" ? ArrowUpRight : moved.direction === "down" ? ArrowDownRight : Minus;
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{value}</dd>
      <dd className="mt-1 flex items-center gap-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
            moved.direction === "up" || moved.direction === "new" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : moved.direction === "down" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon aria-hidden="true" className="size-3" />
          {moved.text}
        </span>
        <span className="text-muted-foreground">vs the {days_label} before</span>
      </dd>
      <dd className="mt-2">
        <Sparkline values={days.map(pick)} />
      </dd>
    </div>
  );
}

/** Which stretch of days the page shows: three links, so the choice is in the address and can be shared or bookmarked. */
function RangePicker({ current }: { current: number }) {
  return (
    <nav aria-label="How far back to look" className="inline-flex rounded-xl border border-border bg-card p-1">
      {RANGES.map((days) => (
        <Link
          key={days}
          href={`/dashboard/admin?days=${days}`}
          aria-current={days === current ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:flex max-sm:min-h-11 max-sm:items-center",
            days === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {days} days
        </Link>
      ))}
    </nav>
  );
}

/**
 * The owner's page: how Brief is being used, as counts. It never shows a document, a question or an answer, and never a name or an
 * address. Every number on it is a total. The top shows the chosen stretch (7, 30 or 90 days) against the one before it, then how people
 * move through Brief, the demo video, what is stored, and reports to download.
 */
export function AdminDashboard({ stats }: { stats: AdminStats }) {
  const { people, time_in_brief: time, documents, questions, reads, overviews, sharing, site, funnel, demo, period } = stats;
  const used = site.daily_limit > 0 ? Math.min(100, Math.round((site.model_calls_today / site.daily_limit) * 100)) : 0;
  const days = stats.by_day;
  const range = stats.range_days;
  const word = `${range} days`;
  const { current, previous } = period;
  const finishRate = percentText(demo.finished_total, demo.opened_total);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangePicker current={range} />
        <p className="text-xs text-muted-foreground">
          Counted in UTC days. Updated {new Date(stats.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.
        </p>
      </div>

      <section aria-labelledby="admin-summary">
        <h2 id="admin-summary" className="sr-only">
          The last {word} at a glance
        </h2>
        <dl aria-label={`The last ${word}`} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="New people" value={current.signed_up} current={current.signed_up} previous={previous.signed_up} days={days} pick={(d) => d.signed_up} days_label={word} />
          <Kpi label="Active people" value={current.people} current={current.people} previous={previous.people} days={days} pick={(d) => d.people} days_label={word} />
          <Kpi label="Documents uploaded" value={current.documents} current={current.documents} previous={previous.documents} days={days} pick={(d) => d.documents} days_label={word} />
          <Kpi label="Questions asked" value={current.questions} current={current.questions} previous={previous.questions} days={days} pick={(d) => d.questions} days_label={word} />
          <Kpi label="Time in Brief" value={minutesText(current.minutes)} current={current.minutes} previous={previous.minutes} days={days} pick={(d) => d.minutes} days_label={word} />
          <Kpi label="Demo video opened" value={current.demo_opened} current={current.demo_opened} previous={previous.demo_opened} days={days} pick={(d) => d.demo_opened} days_label={word} />
        </dl>
      </section>

      <Section id="admin-activity" title="Activity over time" note={`Each point is one day, over the last ${word}. Point at a day to read its numbers.`}>
        <div className="grid gap-8 lg:grid-cols-2">
          <LineChart title="People using Brief" days={days} unit="people" lines={[{ label: "Active people", pick: (d) => d.people, color: "var(--primary)" }, { label: "New sign-ups", pick: (d) => d.signed_up, color: "#0d9488" }]} />
          <LineChart title="Documents and questions" days={days} unit="count" lines={[{ label: "Questions", pick: (d) => d.questions, color: "var(--primary)" }, { label: "Documents uploaded", pick: (d) => d.documents, color: "#d97706" }]} />
          <LineChart title="Time in Brief" days={days} unit="minutes" note="Counted while Brief is open, in front, and being used. A tab left open in the background adds nothing." lines={[{ label: "Minutes", pick: (d) => d.minutes, color: "var(--primary)" }]} />
          <LineChart title="Visits" days={days} unit="visits" lines={[{ label: "Visits", pick: (d) => d.visits, color: "var(--primary)" }]} />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="admin-funnel" title="How far people get" note="Everyone who has ever signed up, counted by the furthest step they reached.">
          <Funnel
            label="How far people get"
            steps={[
              { name: "Signed up", count: funnel.signed_up },
              { name: "Uploaded a document", count: funnel.uploaded_a_document },
              { name: "Asked a question", count: funnel.asked_a_question },
              { name: "Came back on another day", count: funnel.came_back_another_day },
              { name: "Shared their dashboard", count: funnel.shared_their_dashboard },
            ]}
          />
        </Section>
        <Section id="admin-reasons" title="Why people came" note="From the question on the welcome page, which can be skipped.">
          <BarList label="Why people came" counts={stats.reasons} name={reasonLabel} empty="Nobody has signed up yet." />
        </Section>
      </div>

      <Section id="admin-demo" title="The demo video" note="Counted when the Watch how it works button is pressed and when the video plays to the end. Nobody is identified: only a count for each day is kept.">
        <dl aria-label="The demo video" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Opened" value={demo.opened_total} hint={`${demo.opened_7_days} this week · ${demo.opened_30_days} in 30 days`} />
          <Stat label="Watched to the end" value={demo.finished_total} hint={`${demo.finished_7_days} this week`} />
          <Stat label="Finish rate" value={finishRate} hint="Of those who opened it" />
          <Stat label={`Opened, last ${word}`} value={current.demo_opened} hint={`${previous.demo_opened} in the ${word} before`} />
        </dl>
        <div className="mt-6 max-w-3xl">
          <LineChart title="Demo video, opened and finished" days={days} unit="count" lines={[{ label: "Opened", pick: (d) => d.demo_opened, color: "var(--primary)" }, { label: "Watched to the end", pick: (d) => d.demo_finished, color: "#0d9488" }]} />
        </div>
      </Section>

      <Section id="admin-people" title="People" note="Everyone who has signed in with Google, and who has been using Brief.">
        <Stats label="People">
          <Stat label="Signed up" value={people.total} hint="Everyone with an account" />
          <Stat label="New this week" value={people.new_7_days} hint={`${people.new_30_days} in 30 days`} />
          <Stat label="Active today" value={people.active_today} hint="Had Brief open and in use" />
          <Stat label="Active this week" value={people.active_7_days} hint={`${people.active_30_days} in 30 days`} />
        </Stats>
        <div className="mt-4">
          <Stats label="Time in Brief">
            <Stat label="Average visit" value={minutesText(time.average_minutes_per_visit_7_days)} hint="Last 7 days" />
            <Stat label="Per person, per day" value={minutesText(time.average_minutes_per_person_per_day_7_days)} hint="Of people who came, last 7 days" />
            <Stat label="Visits" value={time.visits_7_days} hint="Last 7 days" />
          </Stats>
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

      <Section id="admin-reports" title="Download a report" note="A daily or monthly report, as a spreadsheet or a PDF.">
        <AdminReports />
      </Section>
    </div>
  );
}
