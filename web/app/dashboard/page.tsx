import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { mintServiceToken } from "@/lib/service-token";
import { DeleteAccount } from "@/components/delete-account";
import { DocumentUpload } from "@/components/document-upload";

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
  const email = session?.user?.email ?? "";
  const initialDocuments = email ? await fetchInitialDocuments(email) : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-foreground">Your contracts</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Upload a loan, lease, or job offer. Brief explains it clause by clause and shows you the
            exact words behind every answer.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
          className="flex shrink-0 flex-col items-end gap-1"
        >
          <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{email}</p>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <DocumentUpload initialDocuments={initialDocuments} />

      <footer className="flex flex-col items-start gap-3">
        <p className="text-xs text-muted-foreground">
          Brief explains what a document says. It isn&apos;t legal advice.
        </p>
        <DeleteAccount />
      </footer>
    </div>
  );
}
