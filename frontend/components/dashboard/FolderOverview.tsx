import Link from "next/link";
import type { FolderNode } from "@/lib/api";
import { countContents } from "@/lib/tree";

const FOLDER_ICON = "\u{1F4C1}"; // 📁

interface FolderOverviewProps {
  /** True top-level folders only (`tree.folders`) -- not every folder at
   * every depth. The Documents page remains the place to browse deeper. */
  folders: FolderNode[];
}

/**
 * The Dashboard's compact "Folder Overview" (Phase 6D) -- the workspace's
 * real top-level folders, each with its recursive document count via the
 * same `countContents` helper the Documents page's folder cards already
 * use (Phase 6A). Not a second tree browser: clicking a folder goes to
 * `/documents` (no in-place expand/preview here) -- browsing the
 * hierarchy stays the Documents page's job.
 */
export default function FolderOverview({ folders }: FolderOverviewProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Folder Overview</h2>
        <Link href="/documents" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          View all folders
        </Link>
      </div>

      {folders.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No folders yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {folders.map((folder) => {
            const { documents } = countContents(folder);
            return (
              <Link
                key={folder.id}
                href="/documents"
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span aria-hidden className="shrink-0 text-xl">
                  {FOLDER_ICON}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900" title={folder.name}>
                    {folder.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {documents} document{documents === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
