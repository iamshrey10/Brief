import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WelcomeName } from "@/components/welcome-name";
import { backendGet } from "@/lib/backend";
import { needsName, splitName } from "@/lib/profile";

export const metadata = { title: "Welcome", robots: { index: false, follow: false } };

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
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Welcome to Brief</h1>
        <p className="mt-2 text-muted-foreground">
          What should we call you? If you share your dashboard, people see this name instead of your email address ({email}).
        </p>
      </div>
      <WelcomeName initialFirst={first} initialLast={last} />
    </div>
  );
}
