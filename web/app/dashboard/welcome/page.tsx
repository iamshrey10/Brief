import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WelcomeSetup } from "@/components/welcome-setup";
import { backendGet } from "@/lib/backend";
import { needsName, splitName } from "@/lib/profile";

export const metadata = { title: "Welcome", robots: { index: false, follow: false } };

const NEXT_STEPS = [
  { title: "Add a document", body: "A PDF, or a photo of the pages." },
  { title: "Brief reads every clause", body: "It pulls out the key terms and the questions people skip." },
  { title: "Ask, then check", body: "Every answer shows the exact words it rests on." },
];

/** Asked once, after the first sign in. Whoever you share your dashboard with sees this name instead of your email address. */
export default async function WelcomePage() {
  const session = await auth();
  const email = session?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  // Someone who already gave their name has nothing to do here.
  if (!needsName(await backendGet(email, "/me"))) redirect("/dashboard");

  const { first, last } = splitName(session?.user?.name);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-10 sm:px-6 sm:py-16">
      <header>
        <p className="inline-flex rounded-full border border-border bg-accent px-3 py-1 text-xs font-medium text-accent-foreground sm:text-sm">
          You are in
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Welcome to Brief</h1>
        <p className="mt-2 text-base text-muted-foreground sm:text-lg">
          Two quick questions, about twenty seconds, and then you can add your first document.
        </p>
      </header>

      <WelcomeSetup initialFirst={first} initialLast={last} email={email} />

      <section aria-labelledby="next-heading" className="rounded-2xl border border-border bg-card p-5">
        <h2 id="next-heading" className="text-lg font-semibold tracking-tight text-foreground">
          What happens next
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          {NEXT_STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {index + 1}
              </span>
              <p className="text-sm text-muted-foreground sm:text-base">
                <span className="font-medium text-foreground">{step.title}.</span> {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-sm text-muted-foreground">
        Your documents stay private to you unless you choose to share them. Delete your account at any time and your files go with it.{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Read how we handle your data
        </Link>
        .
      </p>
    </div>
  );
}
