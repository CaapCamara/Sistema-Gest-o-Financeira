import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: { value: "text-slate-900", chip: "bg-slate-100 text-slate-500", bar: "bg-slate-200" },
  positive: { value: "text-emerald-700", chip: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  negative: { value: "text-red-700", chip: "bg-red-50 text-red-600", bar: "bg-red-500" },
  warning: { value: "text-amber-700", chip: "bg-amber-50 text-amber-600", bar: "bg-amber-500" },
  info: { value: "text-brand-700", chip: "bg-brand-50 text-brand-600", bar: "bg-brand-600" },
  rem: { value: "text-rem-700", chip: "bg-rem-50 text-rem-600", bar: "bg-rem-600" },
};

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof tones;
  icon?: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4",
        className,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-0.5", t.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-slate-500">{label}</p>
        {icon && <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.chip)}>{icon}</span>}
      </div>
      <p className={cn("tabular mt-2 text-[22px] font-bold leading-tight tracking-tight", t.value)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
