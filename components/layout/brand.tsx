import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-11 items-center gap-2 font-semibold text-foreground", className)}>
      <span className="relative h-10 w-10 overflow-hidden rounded-md bg-primary shadow-soft">
        <Image src="/plaivra-logo.png" alt="Plaivra logo" fill sizes="40px" className="object-cover" priority />
      </span>
      <span className="tracking-normal">Plaivra</span>
    </Link>
  );
}
