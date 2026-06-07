import { PageHeading } from "@/components/layout/page-heading";
import { AdminExerciseLibraryPanel } from "@/components/admin/admin-panels";

export default function AdminExercisesPage() {
  return (
    <>
      <PageHeading title="Exercise Library" description="Imported wger exercises are active immediately. Remove unwanted movements or add manual ones." />
      <AdminExerciseLibraryPanel />
    </>
  );
}
