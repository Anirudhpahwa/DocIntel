import Link from "next/link";
import UploadControls from "@/components/document/UploadControls";

interface QuickActionsProps {
  onUploaded: () => void;
}

function ActionLinkCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base text-slate-600"
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

/**
 * The Dashboard's four Quick Actions (Phase 6D): Upload Files/Upload
 * Folder trigger the exact same upload implementation as everywhere else
 * (`UploadControls`, `variant="cards"` -- Phase 6A's toolbar variant with
 * a different button shell, still one upload implementation); Ask a
 * Question/Browse Documents are plain navigation to the existing `/ask`
 * and `/documents` routes. `onUploaded` refreshes the Dashboard's own
 * tree fetch (`useDocumentTree`) so the overview cards/recent
 * documents/folder overview reflect a just-completed upload.
 */
export default function QuickActions({ onUploaded }: QuickActionsProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UploadControls variant="cards" onUploaded={onUploaded} />
        <ActionLinkCard
          href="/ask"
          icon={"❓"}
          title="Ask a Question"
          description="Ask anything about your documents"
        />
        <ActionLinkCard
          href="/documents"
          icon={"\u{1F50D}"}
          title="Browse Documents"
          description="Explore and manage your documents"
        />
      </div>
    </div>
  );
}
