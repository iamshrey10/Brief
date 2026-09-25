import { auth, signOut } from "@/auth";

export default async function Dashboard() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as {session?.user?.email}. Document upload goes here next.
      </p>
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
