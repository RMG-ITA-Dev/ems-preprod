import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand-purple text-primary-foreground shadow-raised hover:bg-brand-purple/90 hover:shadow-raised-hover hover:-translate-y-px active:shadow-raised-active active:translate-y-px",
        destructive: "bg-destructive/70 text-destructive-foreground shadow-raised hover:bg-destructive hover:shadow-raised-hover hover:-translate-y-px active:shadow-raised-active active:translate-y-px",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        cancel: "bg-background border border-foreground/40 text-foreground/80 shadow-raised-cancel hover:bg-foreground/15 hover:text-foreground hover:border-foreground/60 hover:shadow-raised-cancel-hover hover:-translate-y-px active:bg-foreground/20 active:shadow-raised-cancel-active active:translate-y-px disabled:bg-muted/50 disabled:text-muted-foreground/50 disabled:border-input/50 disabled:opacity-100 disabled:shadow-none disabled:translate-y-0",
        submit: "bg-info text-info-foreground shadow-raised hover:bg-info/90 hover:shadow-raised-hover hover:-translate-y-px active:shadow-raised-active active:translate-y-px",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
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
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
