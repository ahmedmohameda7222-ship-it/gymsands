import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { QuickChatGptProvider } from "@/components/ai/quick-chatgpt-provider";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <QuickChatGptProvider>
        <AppShell>{children}</AppShell>
      </QuickChatGptProvider>
    </ProtectedRoute>
  );
}
