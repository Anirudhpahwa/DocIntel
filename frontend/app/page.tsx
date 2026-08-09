import WelcomePanel from "@/components/WelcomePanel";

/** Dashboard (`/`) — overview/welcome + system status. No document sidebar here (Phase 6). */
export default function DashboardPage() {
  return (
    <main className="flex-1 p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <WelcomePanel />
      </div>
    </main>
  );
}
