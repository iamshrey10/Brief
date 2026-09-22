export function DocumentPreview() {
  return (
    <div className="relative flex h-[26rem] w-full max-w-md items-center justify-center">
      <div className="absolute w-72 rotate-6 translate-x-6 translate-y-2 rounded-2xl border border-border bg-card p-8 opacity-50" />
      <div className="relative w-80 -rotate-3 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-5 flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </div>
        <div className="my-3 h-3 w-[92%] rounded-full bg-muted" />
        <div className="my-3 h-3 w-[78%] rounded-full bg-muted" />
        <div className="relative my-3 flex h-3 w-[85%] items-center rounded-full bg-amber-300 dark:bg-amber-400/80">
          <span className="absolute -right-4 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg shadow-emerald-700/30 dark:bg-emerald-500 dark:text-emerald-950">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        <div className="my-3 h-3 w-[65%] rounded-full bg-muted" />
        <div className="my-3 h-3 w-[88%] rounded-full bg-muted" />
        <div className="absolute -bottom-5 -left-6 flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-xs font-medium text-background shadow-lg">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          source verified
        </div>
      </div>
    </div>
  );
}
