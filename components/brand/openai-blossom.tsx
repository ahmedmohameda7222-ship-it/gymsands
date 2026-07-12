import Image from "next/image";
import { cn } from "@/lib/utils";

export function OpenAiBlossom({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} aria-hidden="true">
      <Image
        src="/brand/openai/OAI_OpenAI-Blossom_Black.svg"
        alt=""
        width={24}
        height={24}
        className="h-full w-full object-contain dark:hidden"
      />
      <Image
        src="/brand/openai/OAI_OpenAI-Blossom_White.svg"
        alt=""
        width={24}
        height={24}
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}
