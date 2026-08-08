import Header from "@/components/Header";
import DocumentExplorer from "@/components/document/DocumentExplorer";

export default function DashboardPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <DocumentExplorer />
    </div>
  );
}
