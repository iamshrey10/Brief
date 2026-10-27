import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutToHome } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { mintServiceToken } from "@/lib/service-token";
import { DeleteAccount } from "@/components/delete-account";
import { DocumentUpload } from "@/components/document-upload";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Your contracts", robots: { index: false, follow: false } };

async function fetchInitialDocuments(email: string) {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const token = await mintServiceToken(email);

  try {
    const res = await fetch(`${backendUrl}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function Dashboard() {
  const session = await auth();
  const email = session?.user?.email;
  // The middleware already turns visitors away, and this makes the page safe on its own too: nobody who
  // is not signed in is ever shown the dashboard or has anything fetched for it.
  if (!email) redirect("/");
  const initialDocuments = await fetchInitialDocuments(email);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-foreground">Your contracts</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Upload a loan, lease, or job offer. Brief explains it clause by clause and shows you the
            exact words behind every answer.
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          <ThemeToggle />
          <form
            action={signOutToHome}
            className="flex shrink-0 flex-col items-start gap-1 sm:items-end"
          >
            <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{email}</p>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <DocumentUpload initialDocuments={initialDocuments} />

      <footer className="flex flex-col items-start gap-3">
        <p className="text-xs text-muted-foreground">
          Brief explains what a document says. It isn&apos;t legal advice.
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Terms
          </Link>
        </nav>
        <DeleteAccount />
      </footer>
    </div>
  );
}
