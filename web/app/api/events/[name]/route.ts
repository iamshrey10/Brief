import { mintServiceToken } from "@/lib/service-token";

/** The events a visitor who is not signed in can add one to, and no others. */
const EVENTS = new Set(["demo_opened", "demo_finished"]);
/** Who the backend is told this is: no person, so nothing that is sent can be tied to anyone. */
const VISITOR = "site-visitor";

/**
 * Counts that something happened, such as the demo video being opened, for the owner's page. It is open to anyone, because the visitor is
 * not signed in, and it records nothing about them: no address, no cookie, no page. It always answers 204 so it can never get in the
 * way of the page, and a name that is not on the list does nothing.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (EVENTS.has(name)) {
    try {
      await fetch(`${process.env.BACKEND_URL ?? "http://localhost:8000"}/events/${name}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await mintServiceToken(VISITOR)}` },
        cache: "no-store",
      });
    } catch {
      // Counting is never worth an error on the page.
    }
  }
  return new Response(null, { status: 204 });
}
