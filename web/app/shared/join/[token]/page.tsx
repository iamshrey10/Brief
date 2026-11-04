import { auth } from "@/auth";
import { JoinForm } from "@/components/join-form";
import { Button } from "@/components/ui/button";
import { signInToJoin } from "@/lib/auth-actions";

// The secret is in the address, so nothing on this page may be indexed or passed on to another site in a Referer header.
export const metadata = { title: "Open a shared dashboard", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

/** Where an invitation link lands: sign in if needed, then enter the code. Nothing is shown about whose dashboard it is until the code is right. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = (await auth())?.user?.email;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">You were invited to view a dashboard</h1>
        <p className="mt-2 text-muted-foreground">You can look, but not change anything. The person who invited you approves it first.</p>
      </div>
      {email ? (
        <>
          <p className="text-xs text-muted-foreground">Signed in as {email}</p>
          <JoinForm token={token} />
        </>
      ) : (
        <form action={signInToJoin.bind(null, token)}>
          <Button type="submit" size="lg">
            Sign in with Google to continue
          </Button>
        </form>
      )}
    </div>
  );
}
