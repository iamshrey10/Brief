import { proxyGet, proxyPost } from "@/lib/proxy";

/** The signed-in person's own reminders. */
export async function GET() {
  return proxyGet("/me/reminders");
}

/** Adds a reminder for the signed-in person. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "invalid request" }, { status: 400 });
  }
  return proxyPost("/me/reminders", body);
}
