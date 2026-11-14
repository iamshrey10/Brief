"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { asAdminReport, reportCsv, reportFileName, reportPdf } from "@/lib/admin";
import { downloadBytes, downloadTextFile } from "@/lib/download";

type Kind = "day" | "month";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Download the counts for one day or one month as a spreadsheet (CSV) or a PDF. A day defaults to yesterday, which is complete, and a month
 * to this one, which runs to today. The report is asked for from the website's own server with the owner's session and built into a
 * file here in the browser, so the file never passes through anywhere else. It holds counts only.
 */
export function AdminReports({ today = new Date() }: { today?: Date }) {
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const [day, setDay] = useState(isoDay(yesterday));
  const [month, setMonth] = useState(isoDay(today).slice(0, 7));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function download(kind: Kind, format: "csv" | "pdf") {
    const date = kind === "day" ? day : `${month}-01`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMessage(kind === "day" ? "Choose a day first." : "Choose a month first.");
      return;
    }
    setBusy(`${kind}-${format}`);
    setMessage("");
    try {
      const response = await fetch(`/api/backend/admin/report?period=${kind}&date=${date}`, { cache: "no-store" });
      const report = response.ok ? asAdminReport(await response.json()) : null;
      if (!report) throw new Error("no report");
      if (format === "csv") downloadTextFile(reportFileName(report, "csv"), reportCsv(report), "text/csv;charset=utf-8");
      else downloadBytes(reportFileName(report, "pdf"), reportPdf(report), "application/pdf");
      setMessage(`Saved the ${kind === "day" ? "daily" : "monthly"} report for ${report.label}.`);
    } catch {
      setMessage("The report could not be made just now. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const choice = "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:h-11 max-sm:w-full";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(
        [
          { kind: "day" as const, title: "Daily report", label: "Day", input: <input id="report-day" type="date" value={day} max={isoDay(today)} onChange={(event) => setDay(event.target.value)} className={choice} /> },
          { kind: "month" as const, title: "Monthly report", label: "Month", input: <input id="report-month" type="month" value={month} max={isoDay(today).slice(0, 7)} onChange={(event) => setMonth(event.target.value)} className={choice} /> },
        ]
      ).map(({ kind, title, label, input }) => (
        <div key={kind} className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {kind === "day" ? "Everything counted on one day." : "Every day of a month, with the totals. A month not over yet runs to today."}
          </p>
          <label htmlFor={`report-${kind}`} className="mt-3 block text-xs font-medium text-muted-foreground">
            {label}
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            {input}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" disabled={busy !== null} onClick={() => void download(kind, "csv")} aria-label={`Download the ${kind === "day" ? "daily" : "monthly"} report as a CSV spreadsheet`}>
                <Download aria-hidden="true" />
                {busy === `${kind}-csv` ? "Making..." : "CSV"}
              </Button>
              <Button type="button" variant="outline" size="lg" disabled={busy !== null} onClick={() => void download(kind, "pdf")} aria-label={`Download the ${kind === "day" ? "daily" : "monthly"} report as a PDF`}>
                <FileText aria-hidden="true" />
                {busy === `${kind}-pdf` ? "Making..." : "PDF"}
              </Button>
            </div>
          </div>
        </div>
      ))}
      <p role="status" className="text-sm text-muted-foreground md:col-span-2">
        {message || "Reports hold counts only. They never name a person, a document or a question."}
      </p>
    </div>
  );
}
