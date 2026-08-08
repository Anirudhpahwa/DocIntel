import type { ProcessingStatus } from "@/lib/api";

export const PROCESSING_STATUS_DISPLAY: Record<
  ProcessingStatus,
  { icon: string; label: string; colorClassName: string; spin?: boolean }
> = {
  pending: { icon: "○", label: "Queued", colorClassName: "text-slate-400" }, // ○
  processing: { icon: "⟳", label: "Processing", colorClassName: "text-amber-500", spin: true }, // ⟳
  indexed: { icon: "✓", label: "Indexed", colorClassName: "text-emerald-600" }, // ✓
  failed: { icon: "⚠", label: "Failed", colorClassName: "text-red-600" }, // ⚠
};
