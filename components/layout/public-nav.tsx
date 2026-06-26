import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

export function PublicNav() {
  return (
    <header className="glass-shell sticky top-0 z-40 border-x-0 border-t-0">
      <div className="container flex h-16 items-center justify-between">
        <Brand />
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
          <Link href="/about" className="hover:text-primary">
            About
          </Link>
          <Link href="/login" className="hover:text-primary">
            Login
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="sm:hidden">
            <Link href="/about">About</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
