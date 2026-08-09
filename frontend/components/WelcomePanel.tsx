import Link from "next/link";
import HealthStatus from "@/components/HealthStatus";

const QUICK_LINKS = [
  {
    href: "/documents",
    title: "Documents",
    description: "Browse folders, upload files, and manage what's indexed.",
  },
  {
    href: "/ask",
    title: "Ask",
    description: "Ask a plain-English question, grounded in your documents.",
  },
  {
    href: "/summaries",
    title: "Summaries",
    description: "Generate a summary for a document or folder.",
  },
] as const;

function QuickLinkCard({ href, title, description }: (typeof QUICK_LINKS)[number]) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 bg-white p-4 text-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
    </Link>
  );
}

/** Dashboard (`/`) content: overview, quick links to the other workspaces, system status. */
export default function WelcomePanel() {
  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">Welcome to DocIntel</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          DocIntel is a locally hosted document intelligence tool for NHSRCL.
          Upload files and folders, browse your document hierarchy, ask
          plain-English questions grounded in your own documents with
          citations, and generate summaries for any document or folder —
          entirely on local infrastructure, with no paid or external AI API.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <QuickLinkCard key={link.href} {...link} />
          ))}
        </div>
      </section>

      <HealthStatus />
    </>
  );
}
