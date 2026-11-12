import { UploadNotifications } from "@/components/upload-notifications";

/**
 * Around every signed in page, so a note about a document being ready can appear wherever the person has gone.
 * On a phone it also leaves room under the page for the bar of sections fixed at the bottom of the screen.
 */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <UploadNotifications>
      <div className="max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom))] print:pb-0">{children}</div>
    </UploadNotifications>
  );
}
