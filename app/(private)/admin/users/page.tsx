import { PageHeading } from "@/components/layout/page-heading";
import { AdminUsersPanel } from "@/components/admin/admin-panels";

export default function AdminUsersPage() {
  return (
    <>
      <PageHeading title="Manage Users" description="View FitLife Hub users by email/profile only. Passwords are never visible." />
      <AdminUsersPanel />
    </>
  );
}
