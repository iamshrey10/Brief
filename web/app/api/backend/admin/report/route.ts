import { proxyGet } from "@/lib/proxy";

/** A day or month report for the owner. Only a plain period and date are passed on, so nothing else can be slipped into the request to the backend. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const date = searchParams.get("date") ?? "";
  if ((period !== "day" && period !== "month") || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ detail: "choose a day or a month" }, { status: 400 });
  }
  return proxyGet(`/admin/report?period=${period}&date=${date}`);
}
