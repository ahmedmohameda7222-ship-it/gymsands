import { AuthForm } from "@/components/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <main className="premium-page-bg grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <section className="glass-shell m-6 hidden rounded-[32px] p-10 text-foreground lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <div>
          <h1 className="max-w-lg text-5xl font-bold tracking-normal">Plaivra</h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">Simple workout, meal, and progress tracking for real life.</p>
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
