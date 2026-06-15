import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold text-foreground", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-soft">
        <Dumbbell className="h-5 w-5" />
      </span>
      <span className="tracking-normal">FitLife Hub</span>
    </Link>
  );
}
