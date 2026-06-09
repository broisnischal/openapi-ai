import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase transition-colors font-mono',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-[var(--accent)] text-white',
        secondary:   'border-[var(--border)] bg-[var(--elevated)] text-[var(--muted-foreground)]',
        destructive: 'border-[var(--destructive)]/20 bg-[var(--destructive-dim)] text-[var(--destructive)]',
        success:     'border-[var(--success)]/20 bg-[var(--success-dim)] text-[var(--success)]',
        outline:     'border-[var(--border)] text-[var(--foreground)]',
        // HTTP method variants
        GET:     'bg-[rgba(6,182,212,0.1)]  text-[var(--method-get)]    border-[rgba(6,182,212,0.2)]',
        POST:    'bg-[rgba(34,197,94,0.1)]  text-[var(--method-post)]   border-[rgba(34,197,94,0.2)]',
        PUT:     'bg-[rgba(245,158,11,0.1)] text-[var(--method-put)]    border-[rgba(245,158,11,0.2)]',
        PATCH:   'bg-[rgba(168,85,247,0.1)] text-[var(--method-patch)]  border-[rgba(168,85,247,0.2)]',
        DELETE:  'bg-[rgba(239,68,68,0.1)]  text-[var(--method-delete)] border-[rgba(239,68,68,0.2)]',
        HEAD:    'bg-[rgba(100,116,139,0.1)] text-[var(--method-head)]  border-[rgba(100,116,139,0.2)]',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
