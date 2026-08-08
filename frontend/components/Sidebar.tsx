export default function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Documents
        </h2>
        <button
          disabled
          className="cursor-not-allowed rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400"
        >
          Upload
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-500">No documents yet</p>
        <p className="text-xs text-slate-400">
          File and folder uploads will appear here in a later phase.
        </p>
      </div>
    </aside>
  );
}
