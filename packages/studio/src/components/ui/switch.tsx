import { cn } from '../../lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Switch({ checked, onChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('switch', className)}
      {...props}
    >
      <span className="switch-thumb" />
    </button>
  );
}
