import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-[#475234]",
        secondary: "bg-secondary/90 text-secondary-foreground shadow-none hover:bg-secondary",
        outline: "border border-border/80 bg-card/80 text-foreground shadow-none hover:border-primary/40 hover:bg-muted/60 hover:text-primary",
        ghost: "text-muted-foreground shadow-none hover:bg-muted/60 hover:text-primary",
        destructive: "bg-destructive text-destructive-foreground shadow-none hover:bg-[#8F3B34]"
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-10 px-3 text-xs sm:text-sm",
        lg: "h-12 px-5",
        icon: "h-11 w-11"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
