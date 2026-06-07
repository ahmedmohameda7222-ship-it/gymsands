import { PageHeading } from "@/components/layout/page-heading";
import { AdminApiImportsPanel } from "@/components/admin/admin-panels";

export default function AdminApiImportsPage() {
  return (
    <>
      <PageHeading title="API Imports" description="Import exercises from wger only. New exercises become active immediately." />
      <AdminApiImportsPanel />
    </>
  );
}
