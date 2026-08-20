import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand-purple text-primary-foreground ring-1 ring-black/20 shadow-md hover:bg-brand-purple/90 hover:shadow-lg hover:-translate-y-px active:shadow-sm active:translate-y-px",
        destructive: "bg-destructive/70 text-destructive-foreground ring-1 ring-black/20 shadow-md hover:bg-destructive hover:shadow-lg hover:-translate-y-px active:shadow-sm active:translate-y-px",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        cancel: "bg-background border border-foreground/40 text-foreground/80 shadow-md hover:bg-foreground/15 hover:text-foreground hover:border-foreground/60 hover:shadow-lg hover:-translate-y-px active:bg-foreground/20 active:shadow-sm active:translate-y-px disabled:bg-muted/50 disabled:text-muted-foreground/50 disabled:border-input/50 disabled:opacity-100 disabled:shadow-none disabled:translate-y-0",
        submit: "bg-info text-info-foreground ring-1 ring-black/20 shadow-md hover:bg-info/90 hover:shadow-lg hover:-translate-y-px active:shadow-sm active:translate-y-px",
        warning: "bg-warning text-warning-foreground ring-1 ring-black/20 shadow-md hover:bg-warning/90 hover:shadow-lg hover:-translate-y-px active:shadow-sm active:translate-y-px",
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
