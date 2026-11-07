"use client";

import { useUploadNotifications } from "@/components/upload-notifications";
import { cn } from "@/lib/utils";

/**
 * A small red number that marks something leading to the people waiting to be let in, so a request is never missed. In the
 * top bar it sits at the top right of the word (`corner`, inside something positioned); elsewhere it follows the title. It shows
 * nothing when nobody is waiting. Screen readers hear how many are waiting, the number itself is only for the eyes.
 */
export function PendingBadge({ corner = false }: { corner?: boolean }) {
  const { pendingRequests } = useUploadNotifications();
  if (pendingRequests === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white",
          corner ? "absolute top-0 right-0.5" : "ml-1.5 align-middle",
        )}
      >
        {pendingRequests}
      </span>
      <span className="sr-only">
        , {pendingRequests} {pendingRequests === 1 ? "person is" : "people are"} waiting for your approval
      </span>
    </>
  );
}
