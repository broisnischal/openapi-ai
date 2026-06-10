import { cn } from '../../lib/utils';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return <input type="checkbox" className={cn('checkbox', className)} {...props} />;
}
