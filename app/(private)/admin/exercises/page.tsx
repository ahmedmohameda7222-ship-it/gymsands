import { PageHeading } from "@/components/layout/page-heading";
import { AdminExerciseLibraryPanel } from "@/components/admin/admin-panels";

export default function AdminExercisesPage() {
  return (
    <>
      <PageHeading title="Exercise Library" description="Review wger imports, approve safe global exercises, and add manual movements." />
      <AdminExerciseLibraryPanel />
    </>
  );
}
