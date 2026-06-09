import { cn } from '../../lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-[calc(var(--radius)-2px)]',
          'border border-[var(--border)] bg-[var(--input)]',
          'pl-3 pr-9 text-sm text-[var(--foreground)]',
          'outline-none transition-[border-color] duration-100 cursor-pointer',
          'focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
      />
    </div>
  );
}
