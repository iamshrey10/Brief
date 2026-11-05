/**
 * The faint words behind the first screen of the landing page: the phrases a contract is made of, set large in the heading font
 * and barely there, as if the page were a contract seen through frosted glass. One of them wears the same yellow highlight as the
 * illustration. It is decoration only: drawn as picture, hidden from a screen reader, not selectable, fixed in place, and softened at the edges.
 */
const WORDS: { text: string; className: string; marked?: boolean }[] = [
  { text: "security deposit", className: "top-[5%] left-[3%] -rotate-3 text-5xl md:text-7xl" },
  { text: "arbitration", className: "top-[3%] left-[44%] rotate-1 text-3xl md:text-5xl" },
  { text: "late fee", className: "top-[11%] right-[5%] rotate-2 text-4xl md:text-6xl" },
  { text: "interest rate", className: "bottom-[17%] left-[3%] -rotate-2 text-5xl md:text-7xl" },
  { text: "notice period", className: "bottom-[15%] left-[42%] -rotate-1 text-4xl md:text-6xl", marked: true },
  { text: "renewal", className: "bottom-[3%] left-[20%] rotate-2 text-4xl md:text-6xl" },
  { text: "termination", className: "bottom-[4%] right-[4%] rotate-1 text-5xl md:text-7xl" },
];

export function LandingBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_85%)]"
    >
      {WORDS.map((word) => (
        <span
          key={word.text}
          className={`absolute font-heading font-semibold tracking-tight whitespace-nowrap text-foreground/[0.06] ${word.className}`}
        >
          {/* The words are drawn from an attribute, not written as text, so they are picture and never read as page content. */}
          <span
            data-word={word.text}
            className={`before:content-[attr(data-word)] ${word.marked ? "rounded-sm bg-amber-300/25 px-2 dark:bg-amber-400/15" : ""}`}
          />
        </span>
      ))}
    </div>
  );
}
