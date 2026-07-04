import * as React from "react";
import { cn } from "@/lib/utils";

type CardVariant = "solid" | "glass" | "glassStrong";

const cardVariants: Record<CardVariant, string> = {
  solid: "solid-tracking-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card",
  glass: "glass-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card",
  glassStrong: "glass-card-strong transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card"
};

export function Card({
  variant = "solid",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
}) {
  return <div className={cn(cardVariants[variant], "text-card-foreground", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-4 sm:p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-bold leading-5 tracking-[-0.015em] sm:text-base", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-4 pt-0 sm:p-5 sm:pt-0", className)} {...props} />;
}
