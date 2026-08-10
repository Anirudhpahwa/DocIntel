import DashboardOverview from "@/components/dashboard/DashboardOverview";

/** Dashboard (`/`) — workspace overview: real counts, system status, quick actions, recent documents, folder overview (Phase 6D). No document sidebar here. */
export default function DashboardPage() {
  return (
    <main className="flex-1 p-6">
      <div className="mx-auto max-w-6xl">
        <DashboardOverview />
      </div>
    </main>
  );
}
