import { Suspense } from "react";

import { ActivityPing } from "@/components/activity-ping";
import { GuidedTour } from "@/components/guided-tour";
import { NavigationProgress } from "@/components/navigation-progress";
import { UploadNotifications } from "@/components/upload-notifications";

/**
 * Around every signed in page, so a note about a document being ready can appear wherever the person has gone, so the
 * time Brief is open and in use can be counted, and so the guided tour stays open as they move between pages.
 * On a phone it also leaves room under the page for the bar of sections fixed at the bottom of the screen.
 */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <UploadNotifications>
      <ActivityPing />
      <Suspense fallback={null}>
        <GuidedTour />
        <NavigationProgress />
      </Suspense>
      <div className="max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom))] print:pb-0">{children}</div>
    </UploadNotifications>
  );
}
