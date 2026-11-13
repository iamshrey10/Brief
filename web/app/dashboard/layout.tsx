import { ActivityPing } from "@/components/activity-ping";
import { UploadNotifications } from "@/components/upload-notifications";

/**
 * Around every signed in page, so a note about a document being ready can appear wherever the person has gone, and so the
 * time Brief is open and in use can be counted.
 * On a phone it also leaves room under the page for the bar of sections fixed at the bottom of the screen.
 */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <UploadNotifications>
      <ActivityPing />
      <div className="max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom))] print:pb-0">{children}</div>
    </UploadNotifications>
  );
}
