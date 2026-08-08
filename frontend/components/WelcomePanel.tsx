import HealthStatus from "@/components/HealthStatus";

/** Default main-content view shown while nothing is selected in the document tree. */
export default function WelcomePanel() {
  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">Welcome to DocIntel</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Upload documents, explore your file hierarchy, and ask plain-English
          questions grounded in your own files. Select a file or folder on
          the left to see its details, or upload something to get started.
        </p>
      </section>

      <HealthStatus />

      <section className="rounded-lg border border-slate-200 bg-white p-8">
        <h2 className="text-sm font-semibold text-slate-900">What&apos;s coming next</h2>
        <ul className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
          <li>Ask questions with citations</li>
          <li>Per-file and per-folder summaries</li>
          <li>Text extraction &amp; search</li>
          <li>Locally hosted AI answers via Ollama</li>
        </ul>
      </section>
    </>
  );
}
