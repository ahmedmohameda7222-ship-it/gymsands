import { AuthForm } from "@/components/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <section className="blue-surface hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Brand className="text-white" />
        <div>
          <h1 className="max-w-lg text-5xl font-bold tracking-normal">Plaivra</h1>
          <p className="mt-4 max-w-md text-lg text-[#f4efe6]/80">Simple workout, meal, and progress tracking for real life.</p>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Brand className="mb-6 lg:hidden" />
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading login...</div>}>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
