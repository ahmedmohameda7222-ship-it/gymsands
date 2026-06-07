import { PageHeading } from "@/components/layout/page-heading";
import { AdminApiStatusPanel } from "@/components/admin/admin-panels";

export default function AdminApiStatusPage() {
  return (
    <>
      <PageHeading title="API Status" description="Provider readiness without exposing secret values." />
      <AdminApiStatusPanel />
    </>
  );
}
