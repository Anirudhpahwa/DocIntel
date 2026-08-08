import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import HealthStatus from "@/components/HealthStatus";

export default function DashboardPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <section className="rounded-lg border border-slate-200 bg-white p-8">
              <h1 className="text-xl font-semibold text-slate-900">
                Welcome to DocIntel
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                Upload documents, explore your file hierarchy, and ask
                plain-English questions grounded in your own files. Document
                upload, search, and summarization are being built out in
                upcoming phases — this dashboard establishes the foundation.
              </p>
            </section>

            <HealthStatus />

            <section className="rounded-lg border border-slate-200 bg-white p-8">
              <h2 className="text-sm font-semibold text-slate-900">
                What&apos;s coming next
              </h2>
              <ul className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                <li>Upload files &amp; folders</li>
                <li>Browse document hierarchy</li>
                <li>Ask questions with citations</li>
                <li>Per-file and per-folder summaries</li>
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
