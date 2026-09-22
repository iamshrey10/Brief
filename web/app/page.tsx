import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <h1 className="text-5xl font-semibold tracking-tight text-foreground">
        Brief<span className="text-primary">.</span>
      </h1>
      <p className="font-heading text-xl text-primary">Every clause, explained.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Actively being built. Check back soon for the full app.
      </p>
    </div>
  );
}
