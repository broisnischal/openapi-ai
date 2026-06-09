import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-[calc(var(--radius)-2px)]',
        'border border-[var(--border)] bg-[var(--input)]',
        'px-3 py-2 text-sm text-[var(--foreground)]',
        'font-mono placeholder:text-[var(--placeholder-foreground)]',
        'outline-none transition-[border-color] duration-100 resize-vertical',
        'focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--ring)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
