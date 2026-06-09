import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-[calc(var(--radius)-2px)]',
        'border border-[var(--border)] bg-[var(--input)]',
        'px-3 py-2 text-sm text-[var(--foreground)]',
        'placeholder:text-[var(--placeholder-foreground)]',
        'outline-none transition-[border-color,box-shadow] duration-100',
        'focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--ring)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  );
}
