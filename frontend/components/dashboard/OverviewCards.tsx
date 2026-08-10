import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";

interface OverviewCardsProps {
  documentCount: number;
  folderCount: number;
  indexedCount: number;
  processingCount: number;
  failedCount: number;
}

function OverviewCard({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * The Dashboard's four overview cards (Phase 6D). Every number here is
 * derived from the real `/api/documents/tree` response (via
 * `countContents`/`flattenDocuments`, `lib/tree.ts`) -- no storage size,
 * chunk counts, trends, or percentages, since none of those are reliably
 * exposed by the existing API. See `DashboardOverview.tsx` for exactly
 * how each number is computed.
 */
export default function OverviewCards({
  documentCount,
  folderCount,
  indexedCount,
  processingCount,
  failedCount,
}: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <OverviewCard icon={"\u{1F4C4}"} label="Documents">
        <p className="text-2xl font-semibold text-slate-900">{documentCount}</p>
        <p className="text-xs text-slate-400">Total documents</p>
      </OverviewCard>

      <OverviewCard icon={"\u{1F4C1}"} label="Folders">
        <p className="text-2xl font-semibold text-slate-900">{folderCount}</p>
        <p className="text-xs text-slate-400">Total folders</p>
      </OverviewCard>

      <OverviewCard icon={PROCESSING_STATUS_DISPLAY.indexed.icon} label="Indexed">
        <p className="text-2xl font-semibold text-slate-900">{indexedCount}</p>
        <p className="text-xs text-slate-400">Documents indexed</p>
      </OverviewCard>

      <OverviewCard icon={PROCESSING_STATUS_DISPLAY.processing.icon} label="Processing / Failed">
        <div className="flex items-baseline gap-4">
          <span>
            <span className="text-lg font-semibold text-amber-600">{processingCount}</span>
            <span className="ml-1 text-xs text-slate-400">Processing</span>
          </span>
          <span>
            <span className="text-lg font-semibold text-red-600">{failedCount}</span>
            <span className="ml-1 text-xs text-slate-400">Failed</span>
          </span>
        </div>
      </OverviewCard>
    </div>
  );
}
