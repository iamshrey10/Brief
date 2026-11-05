/**
 * The faint words behind a screen of the landing page: the phrases a contract is made of, set large in the heading font and barely
 * there, as if the page were a contract seen through frosted glass. Each screen has its own set, kept to the top and bottom of the
 * screen and its corners so they never sit under the text, and one phrase wears the same yellow highlight as the illustration. It is
 * decoration only: drawn from an attribute so it is picture and never page text, hidden from a screen reader, not selectable, not
 * clickable, and softened at the edges.
 */
type Word = { text: string; className: string; marked?: boolean };

export const HERO_WORDS: Word[] = [
  { text: "security deposit", className: "top-[4%] left-[3%] -rotate-3 text-5xl md:text-7xl" },
  { text: "arbitration", className: "top-[2%] left-[40%] rotate-1 text-3xl md:text-5xl" },
  { text: "late fee", className: "top-[8%] right-[4%] rotate-2 text-4xl md:text-6xl" },
  { text: "APR", className: "top-[24%] right-[34%] -rotate-2 text-3xl md:text-5xl" },
  { text: "governing law", className: "top-[15%] right-[38%] rotate-1 text-2xl md:text-4xl" },
  { text: "interest rate", className: "bottom-[19%] left-[3%] -rotate-2 text-5xl md:text-7xl" },
  { text: "notice period", className: "bottom-[16%] left-[42%] -rotate-1 text-4xl md:text-6xl", marked: true },
  { text: "base salary", className: "bottom-[28%] right-[3%] rotate-2 text-3xl md:text-5xl" },
  { text: "renewal", className: "bottom-[3%] left-[21%] rotate-2 text-4xl md:text-6xl" },
  { text: "termination", className: "bottom-[4%] right-[3%] rotate-1 text-5xl md:text-7xl" },
  { text: "prepayment", className: "bottom-[2%] left-[56%] -rotate-2 text-2xl md:text-4xl" },
  { text: "sublease", className: "top-[12%] left-[62%] rotate-1 text-2xl md:text-3xl" },
];

export const FEATURES_WORDS: Word[] = [
  { text: "origination fee", className: "top-[4%] left-[3%] rotate-2 text-4xl md:text-6xl" },
  { text: "grace period", className: "top-[3%] left-[38%] -rotate-1 text-3xl md:text-5xl" },
  { text: "severance", className: "top-[5%] right-[3%] -rotate-2 text-4xl md:text-6xl" },
  { text: "co-signer", className: "top-[18%] right-[40%] rotate-1 text-2xl md:text-4xl" },
  { text: "pet policy", className: "bottom-[6%] left-[4%] -rotate-2 text-4xl md:text-6xl" },
  { text: "vesting", className: "bottom-[4%] left-[38%] rotate-1 text-5xl md:text-7xl" },
  { text: "indemnity", className: "bottom-[8%] right-[4%] rotate-2 text-4xl md:text-6xl" },
  { text: "cure period", className: "bottom-[3%] right-[28%] -rotate-1 text-3xl md:text-5xl", marked: true },
  { text: "escrow", className: "bottom-[14%] left-[24%] rotate-2 text-2xl md:text-4xl" },
  { text: "amendment", className: "bottom-[15%] left-[1%] -rotate-1 text-2xl md:text-3xl" },
];

export const HOW_WORDS: Word[] = [
  { text: "confidentiality", className: "top-[4%] left-[3%] -rotate-2 text-4xl md:text-6xl" },
  { text: "probation", className: "top-[3%] left-[42%] rotate-1 text-3xl md:text-5xl" },
  { text: "liability", className: "top-[6%] right-[4%] rotate-2 text-5xl md:text-7xl" },
  { text: "utilities", className: "bottom-[15%] left-[34%] -rotate-1 text-2xl md:text-4xl" },
  { text: "maintenance", className: "bottom-[5%] left-[3%] rotate-1 text-5xl md:text-7xl" },
  { text: "at-will", className: "bottom-[6%] left-[40%] -rotate-2 text-4xl md:text-6xl" },
  { text: "default", className: "bottom-[4%] right-[4%] rotate-2 text-4xl md:text-6xl" },
  { text: "assignment", className: "bottom-[16%] right-[24%] -rotate-1 text-3xl md:text-5xl", marked: true },
  { text: "benefits", className: "top-[22%] right-[3%] rotate-1 text-2xl md:text-3xl" },
  { text: "non-compete", className: "bottom-[14%] left-[1%] -rotate-2 text-2xl md:text-4xl" },
];

export function LandingBackdrop({ words }: { words: Word[] }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_85%)]"
    >
      {words.map((word) => (
        <span
          key={word.text}
          className={`absolute font-heading font-semibold tracking-tight whitespace-nowrap text-foreground/[0.07] ${word.className}`}
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
