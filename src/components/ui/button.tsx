import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-body-desktop font-semibold ring-offset-background transition-all duration-200 motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary-glow/85 hover:shadow-primary-glow/75',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg',
        outline:
          'border-2 border-input/80 bg-transparent text-foreground hover:bg-accent/15 hover:text-accent-foreground shadow-sm',
        secondary:
          'bg-secondary/90 text-secondary-foreground hover:bg-secondary/75 hover:text-secondary-foreground shadow-sm',
        ghost: 'text-foreground/90 hover:bg-accent/10 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // Marketing/CTA gold fill — gradient, black text, glow handled by .accent-fill-gold
        premium: 'accent-fill-gold',
      },
      size: {
        default: 'h-11 min-h-[44px] px-7 py-2.5 text-base md:h-10 md:px-6',
        md: 'h-11 min-h-[44px] px-5 py-2 text-sm md:h-9 md:px-4',
        sm: 'h-10 rounded-lg px-4 text-sm min-h-[40px]',
        lg: 'h-14 rounded-xl px-10 text-lg min-h-[56px]', // Much larger
        icon: 'h-12 w-12 min-h-[48px] min-w-[48px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
