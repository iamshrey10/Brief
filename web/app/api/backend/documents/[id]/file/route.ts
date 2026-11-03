import { proxyGet } from "@/lib/proxy";

/**
 * Opens the person's original file. The backend makes a link that lasts five minutes, and this sends the
 * browser straight to it, so the eye button is a plain link that opens in a new tab and is never
 * stopped as a pop-up. A refusal is passed on as it is, never turned into a redirect.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const answer = await proxyGet(`/documents/${encodeURIComponent(id)}/file`);
  if (!answer.ok) return answer;
  const { url } = (await answer.json()) as { url?: unknown };
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return Response.json({ detail: "could not open that file" }, { status: 502 });
  }
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
