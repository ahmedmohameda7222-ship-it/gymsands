import { PageHeading } from "@/components/layout/page-heading";
import { AdminAuditPanel, AdminQualityPanel } from "@/components/admin/admin-panels";

export default function AdminAuditPage() {
  return (
    <>
      <PageHeading title="Audit & Quality" description="Review admin changes, MCP connector calls, and content quality issues." />
      <div className="space-y-4">
        <AdminQualityPanel />
        <AdminAuditPanel />
      </div>
    </>
  );
}
