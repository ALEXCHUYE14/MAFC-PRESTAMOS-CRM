import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-hover",
        secondary: "border border-sand-border bg-surface text-ink hover:bg-sand",
        ghost: "text-ink-muted hover:bg-sand hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger/90",
        "danger-outline": "border border-danger/30 bg-surface text-danger hover:bg-danger-bg",
        link: "text-brand underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-11 px-4 lg:h-10",
        lg: "h-12 px-5 text-base",
        icon: "h-11 w-11 lg:h-10 lg:w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
