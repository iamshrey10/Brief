import { auth, signOut } from "@/auth";
import { mintServiceToken } from "@/lib/service-token";
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
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-6 py-16 text-center">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Signed in as {session?.user?.email}</p>
      </div>

      <DocumentUpload initialDocuments={initialDocuments} />

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className="text-sm text-primary underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
