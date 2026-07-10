import { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'blue' | 'purple';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  // Variant styling
  const variantStyles: Record<ButtonVariant, string> = {
    primary: 'bg-gold text-black font-semibold hover:bg-gold-hover hover:scale-[1.02] active:scale-[0.98] transition-all duration-200',
    secondary: 'bg-zinc-750 text-gray-200 border border-zinc-700 hover:bg-zinc-700 transition-colors',
    danger: 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors',
    ghost: 'text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors',
    outline: 'border border-zinc-700 text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors',
    blue: 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors',
    purple: 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors',
  };

  // Size styling
  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-base rounded-xl',
  };

  const baseStyles = 'flex items-center justify-center gap-2 font-medium transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100';
  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && leftIcon && <span className="flex items-center">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="flex items-center">{rightIcon}</span>}
    </button>
  );
}
