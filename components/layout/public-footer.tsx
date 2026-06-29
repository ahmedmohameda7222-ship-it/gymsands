import Link from "next/link";

const legalLinks = [
  ["Impressum", "/legal/impressum"],
  ["Privacy", "/legal/privacy"],
  ["Terms", "/legal/terms"],
  ["Health disclaimer", "/legal/disclaimer"]
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/50">
      <div className="container flex flex-col gap-3 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Plaivra. Legal templates require professional review.</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          {legalLinks.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-primary">{label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
