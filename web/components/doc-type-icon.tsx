import { Briefcase, FileText, House, Landmark, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  loan: Landmark,
  lease: House,
  offer: Briefcase,
};

/** The icon for a kind of document, or a plain document for a kind it does not know. */
export function DocTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type] ?? FileText;
  return <Icon aria-hidden className={className} />;
}
