/**
 * The small animated scene on each How it works card. They are decoration and carry no words, so a screen reader skips them, and
 * each one's finished picture is what shows when nothing moves. The movement itself is in globals.css, and plays only while the
 * section is on screen.
 */
function Frame({ scene, children }: { scene: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`hiw-art ${scene} relative h-32 overflow-hidden rounded-xl border border-border bg-gradient-to-b from-card to-secondary/60`}
    >
      <div className="hiw-scene absolute inset-0">{children}</div>
    </div>
  );
}

/** Add your document: a file drops into a tray, a bar fills, and a check appears. */
function AddDocumentScene() {
  return (
    <Frame scene="hiw-s1">
      <div className="absolute inset-x-8 bottom-9 h-9 rounded-lg border-2 border-dashed border-primary/40 bg-accent/60" />
      <div className="hiw-drop absolute bottom-12 left-1/2 flex h-16 w-12 -translate-x-1/2 flex-col gap-1.5 rounded-md border border-border bg-background p-2 shadow-md">
        <span className="h-1 w-full rounded-full bg-foreground/25" />
        <span className="h-1 w-4/5 rounded-full bg-foreground/20" />
        <span className="h-1 w-full rounded-full bg-foreground/20" />
        <span className="h-1 w-3/5 rounded-full bg-foreground/15" />
      </div>
      <div className="absolute inset-x-8 bottom-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="hiw-fill h-full origin-left rounded-full bg-primary" />
      </div>
      <span className="hiw-pop absolute top-4 right-6 flex size-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" className="size-4">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Frame>
  );
}

/** The scene for one How it works step, by its place in the list, or nothing for a step that has none. */
export function StepArt({ index }: { index: number }) {
  if (index === 0) return <AddDocumentScene />;
  return null;
}
