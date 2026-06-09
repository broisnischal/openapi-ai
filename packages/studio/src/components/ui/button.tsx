import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import type { ButtonHTMLAttributes } from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-45 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-87',
        secondary:
          'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--elevated)] border border-[var(--border)]',
        outline:
          'bg-transparent border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)] hover:border-[var(--border-hover)]',
        ghost:
          'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)]',
        destructive:
          'bg-[var(--destructive-dim)] text-[var(--destructive)] border border-[rgba(239,68,68,0.2)] hover:bg-[var(--destructive)] hover:text-white',
        accent:
          'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover,#4f46e5)]',
        link:
          'text-[var(--accent)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-7 px-3 text-xs rounded-[calc(var(--radius)-2px)]',
        lg:      'h-11 px-6 rounded-[var(--radius)]',
        icon:    'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0 rounded-[calc(var(--radius)-2px)]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
