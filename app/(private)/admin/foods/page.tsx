import { PageHeading } from "@/components/layout/page-heading";
import { AdminFoodPanelSafe } from "@/components/admin/admin-food-panel-safe";

export default function AdminFoodsPage() {
  return (
    <>
      <PageHeading title="Manage Egyptian Foods" description="Admin-managed global Egyptian foods and approximate macros." />
      <AdminFoodPanelSafe />
    </>
  );
}
