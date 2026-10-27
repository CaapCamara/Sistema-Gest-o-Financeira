import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:text-slate-950 hover:ring-slate-300"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-slate-950 sm:text-[32px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
