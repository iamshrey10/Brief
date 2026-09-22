import { ThemeToggle } from "@/components/theme-toggle";
import { DocumentPreview } from "@/components/document-preview";

export default function Home() {
  return (
    <div className="relative flex flex-1 items-center bg-background px-6 py-16 md:px-16">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-md flex-col gap-4 text-center md:text-left">
          <div>
            <h1 className="text-6xl font-semibold tracking-tight text-foreground">
              Brief<span className="text-primary">.</span>
            </h1>
            <p className="font-heading text-2xl text-primary">Every clause, explained.</p>
          </div>
          <p className="text-lg text-muted-foreground">
            An AI that reads your contract and shows you{" "}
            <span className="font-medium text-foreground">
              exactly where every answer comes from
            </span>
            , not a guess.
          </p>
          <p className="font-mono text-xs tracking-wide text-muted-foreground">
            SHREYASREVANKAR.COM
          </p>
        </div>
        <DocumentPreview />
      </div>
    </div>
  );
}
