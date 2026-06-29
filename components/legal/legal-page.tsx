import { PublicFooter } from "@/components/layout/public-footer";
import { PublicNav } from "@/components/layout/public-nav";

export function LegalPage({
  eyebrow,
  title,
  intro,
  children
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="premium-page-bg min-h-screen text-foreground">
      <PublicNav />
      <main id="main-content" className="container py-12">
        <article className="glass-card-strong mx-auto max-w-4xl p-5 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal">{title}</h1>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Template notice: this page is a production placeholder and must be reviewed and completed by qualified German/EU legal counsel before launch.
          </p>
          <p className="mt-6 text-base leading-8 text-muted-foreground">{intro}</p>
          <div className="mt-8 space-y-8 text-base leading-8 text-muted-foreground">{children}</div>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
