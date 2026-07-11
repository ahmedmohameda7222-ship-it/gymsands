import { redirect } from "next/navigation";

export default function LegacyChatGptSetupPage() {
  redirect("/settings/connections/chatgpt");
}
