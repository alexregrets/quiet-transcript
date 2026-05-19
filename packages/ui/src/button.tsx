import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-stone-950 text-stone-50 shadow-soft hover:bg-stone-800",
  secondary: "border border-stone-300/80 bg-white/70 text-stone-900 hover:bg-white",
  ghost: "text-stone-600 hover:bg-stone-200/60 hover:text-stone-950"
};

export const Button = ({ className, variant = "primary", children, ...props }: PropsWithChildren<ButtonProps>) => (
  <button
    className={cn(
      "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50",
      variants[variant],
      className
    )}
    {...props}
  >
    {children}
  </button>
);
