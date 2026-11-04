import { redirect } from "next/navigation";

/** The Bin lives in the Profile section now, so an old link or bookmark lands on it there. */
export default function BinPage() {
  redirect("/dashboard/profile#bin");
}
