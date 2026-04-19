import { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--sf-accent)] text-white border border-[var(--sf-accent)] hover:bg-[var(--sf-accent-hover)]",
  secondary:
    "bg-white text-[var(--sf-text)] border border-[var(--sf-line-strong)] hover:border-[var(--sf-text)]",
  ghost:
    "bg-transparent text-[var(--sf-text)] border border-transparent hover:bg-[var(--sf-bg-soft)]",
};

const sizeClassMap: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  fullWidth = false,
  iconLeft,
  iconRight,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-60 ${variantClassMap[variant]} ${sizeClassMap[size]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...props}
    >
      {iconLeft}
      <span>{children}</span>
      {iconRight}
    </button>
  );
}
