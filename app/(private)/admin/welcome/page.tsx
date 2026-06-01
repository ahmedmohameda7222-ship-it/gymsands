import { PageHeading } from "@/components/layout/page-heading";
import { AdminWelcomePanel } from "@/components/admin/admin-panels";

export default function AdminWelcomePage() {
  return (
    <>
      <PageHeading title="Manage Welcome Messages" description="Set default or user-specific FitLife Hub welcome popups." />
      <AdminWelcomePanel />
    </>
  );
}
