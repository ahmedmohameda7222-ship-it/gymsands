"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/50 bg-white/35 p-1 text-muted-foreground shadow-soft backdrop-blur-md dark:border-white/10 dark:bg-white/5", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground", className)}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4", className)} {...props} />;
}
