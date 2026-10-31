import Link from "next/link";

import type { OpenQuestionGroup } from "@/lib/dashboard";

/** The questions still to ask the other side, from every document, so nothing is forgotten. Nothing when none are open. */
export function OpenQuestions({ groups }: { groups: OpenQuestionGroup[] }) {
  if (groups.length === 0) return null;
  const total = groups.reduce((sum, group) => sum + group.total, 0);

  return (
    <section aria-labelledby="still-to-ask-heading" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="still-to-ask-heading" className="font-heading text-lg font-semibold tracking-tight">
          Still to ask
        </h2>
        <p className="text-xs">
          {total} {total === 1 ? "question" : "questions"} your {groups.length === 1 ? "document leaves" : "documents leave"} open
        </p>
      </div>
      <ul className="mt-3 flex flex-col gap-4">
        {groups.map((group) => (
          <li key={group.documentId}>
            <Link
              href={`/dashboard/documents/${group.documentId}`}
              className="text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {group.filename}
            </Link>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm">
              {group.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            {group.total > group.questions.length && (
              <p className="mt-1 pl-5 text-xs">and {group.total - group.questions.length} more in the document</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
