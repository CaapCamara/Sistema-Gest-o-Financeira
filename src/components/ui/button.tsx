import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-black shadow-[0_0_24px_-6px] shadow-brand-600/60 hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-slate-50 text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-100 hover:ring-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-black hover:bg-red-700",
  success: "bg-emerald-600 text-black shadow-[0_0_24px_-6px] shadow-emerald-600/60 hover:bg-emerald-700",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
