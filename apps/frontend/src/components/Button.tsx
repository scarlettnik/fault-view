import type { ButtonHTMLAttributes } from 'react';
import { SpinnerGapIcon } from '@phosphor-icons/react';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
}
export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`button ${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <SpinnerGapIcon aria-hidden className="spin" size={18} /> : null}
      {children}
    </button>
  );
}
