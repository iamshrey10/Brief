import { UploadNotifications } from "@/components/upload-notifications";

/** Around every signed in page, so a note about a document being ready can appear wherever the person has gone. */
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <UploadNotifications>{children}</UploadNotifications>;
}
