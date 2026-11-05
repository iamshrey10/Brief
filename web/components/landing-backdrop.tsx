/**
 * The faint words behind the whole landing page: the phrases a contract is made of, set small in the heading font in staggered
 * rows, like wallpaper. The layer is fixed to the window, so it stays put while the sections scroll over it. One phrase wears the
 * same yellow highlight as the illustration. It is decoration only: drawn from an attribute so it is picture and never page text,
 * hidden from a screen reader, not selectable, and softened at the edges.
 */
const PHRASES = [
  "security deposit", "late fee", "notice period", "interest rate", "renewal", "termination", "arbitration", "APR",
  "prepayment", "indemnity", "governing law", "grace period", "base salary", "at-will", "non-compete", "severance",
  "co-signer", "origination fee", "default", "sublease", "pet policy", "maintenance", "utilities", "liability",
  "confidentiality", "probation", "benefits", "vesting", "escrow", "cure period", "amendment", "assignment",
];

const SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-sm", "text-base"];
const TILTS = ["-rotate-2", "rotate-0", "rotate-2", "-rotate-1", "rotate-1", "rotate-0"];

const ROWS = 13;
const COLUMNS = 5;
/** The one phrase that carries the highlight, by its place in the grid. */
const MARKED = { row: 11, column: 3 };

type Cell = { key: string; text: string; top: string; left: string; size: string; tilt: string; marked: boolean };

/** The same cells every time, so the server and the browser draw the same picture. */
export const CELLS: Cell[] = Array.from({ length: ROWS * COLUMNS }, (_, index) => {
  const row = Math.floor(index / COLUMNS);
  const column = index % COLUMNS;
  return {
    key: `${row}-${column}`,
    text: PHRASES[(row * 7 + column * 3) % PHRASES.length],
    top: `${(row / ROWS) * 100 + 1}%`,
    left: `${(column / COLUMNS) * 100 + (row % 2 === 0 ? 2 : 11)}%`,
    size: SIZES[(row * 3 + column) % SIZES.length],
    tilt: TILTS[(row + column * 2) % TILTS.length],
    marked: row === MARKED.row && column === MARKED.column,
  };
});

export function LandingBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_95%)]"
    >
      {CELLS.map((cell) => (
        <span
          key={cell.key}
          className={`absolute font-heading font-semibold tracking-tight whitespace-nowrap text-foreground/[0.09] ${cell.size} ${cell.tilt}`}
          style={{ top: cell.top, left: cell.left }}
        >
          {/* The words are drawn from an attribute, not written as text, so they are picture and never read as page content. */}
          <span
            data-word={cell.text}
            className={`before:content-[attr(data-word)] ${cell.marked ? "rounded-sm bg-amber-300/30 px-1.5 dark:bg-amber-400/20" : ""}`}
          />
        </span>
      ))}
    </div>
  );
}
