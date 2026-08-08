export default function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white">
          DI
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-slate-900">DocIntel</p>
          <p className="text-xs leading-none text-slate-500">Document Query &amp; Summarization</p>
        </div>
      </div>

      <nav className="flex items-center gap-6 text-sm text-slate-500">
        <span className="font-medium text-slate-900">Dashboard</span>
        <span className="cursor-not-allowed text-slate-300">Documents</span>
        <span className="cursor-not-allowed text-slate-300">Ask</span>
        <span className="cursor-not-allowed text-slate-300">Summaries</span>
      </nav>

      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
        NHSRCL Internal
      </span>
    </header>
  );
}
