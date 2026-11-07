"use client";

import { useUploadNotifications } from "@/components/upload-notifications";
import { cn } from "@/lib/utils";

/**
 * A small red number beside something that leads to the people waiting to be let in, so a request is never missed. It shows
 * nothing when nobody is waiting. Screen readers hear how many are waiting, the number itself is only for the eyes.
 */
export function PendingBadge({ className }: { className?: string }) {
  const { pendingRequests } = useUploadNotifications();
  if (pendingRequests === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn("ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs leading-none font-semibold text-white", className)}
      >
        {pendingRequests}
      </span>
      <span className="sr-only">
        , {pendingRequests} {pendingRequests === 1 ? "person is" : "people are"} waiting for your approval
      </span>
    </>
  );
}
