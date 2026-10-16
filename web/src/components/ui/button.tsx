import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Comic look (ADR-0013): ink outline, a hard shadow that the button presses into.
        default:
          "border-2 border-ink bg-primary text-primary-foreground shadow-comic-sm hover:bg-[color-mix(in_oklch,var(--primary),white_22%)] active:not-aria-[haspopup]:translate-x-0.5 active:not-aria-[haspopup]:translate-y-0.5 active:shadow-none",
        outline:
          "border-2 border-ink bg-card shadow-comic-sm hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground active:not-aria-[haspopup]:translate-x-0.5 active:not-aria-[haspopup]:translate-y-0.5 active:shadow-none",
        secondary:
          "border-2 border-ink bg-secondary text-secondary-foreground shadow-comic-sm hover:bg-accent aria-expanded:bg-secondary aria-expanded:text-secondary-foreground active:not-aria-[haspopup]:translate-x-0.5 active:not-aria-[haspopup]:translate-y-0.5 active:shadow-none",
        ghost:
          "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "border-2 border-destructive bg-destructive/10 text-destructive shadow-[2px_2px_0_0_var(--destructive)] hover:bg-destructive/20 focus-visible:border-destructive focus-visible:ring-destructive/20 active:not-aria-[haspopup]:translate-x-0.5 active:not-aria-[haspopup]:translate-y-0.5 active:shadow-none dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
