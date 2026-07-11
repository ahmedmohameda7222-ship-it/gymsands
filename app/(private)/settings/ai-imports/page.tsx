import { redirect } from "next/navigation";

export default function LegacyAiImportsSettingsPage() {
  redirect("/settings/connections");
}
