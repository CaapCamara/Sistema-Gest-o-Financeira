import { cn } from "@/lib/utils";

const fill = {
  brand: "bg-brand-600",
  juros: "bg-juros-700",
  green: "bg-emerald-500",
  rem: "bg-rem-600",
  amber: "bg-amber-500",
  red: "bg-red-500",
} as const;

export type ProgressTone = keyof typeof fill;

/** Barra de progresso simples (0 a 100). */
export function ProgressBar({ value, tone = "brand", className }: { value: number; tone?: ProgressTone; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-slate-200", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
    >
      <div className={cn("fluxo-anima h-full rounded-full", fill[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

/**
 * Barra de fluxo: como um valor se dividiu entre destinos
 * (juros = branco, reserva = verde, remanescente = cinza).
 */
export function SplitBar({
  partes,
  className,
}: {
  partes: { valor: number; tone: ProgressTone; rotulo?: string }[];
  className?: string;
}) {
  const total = partes.reduce((acc, p) => acc + Math.max(0, p.valor), 0);
  if (total <= 0) return <div className={cn("h-2 w-full rounded-full bg-slate-200", className)} />;
  return (
    <div className={cn("fluxo-anima flex h-2 w-full gap-0.5 overflow-hidden rounded-full", className)}>
      {partes
        .filter((p) => p.valor > 0)
        .map((p, i) => (
          <div
            key={i}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", fill[p.tone])}
            style={{ width: `${(p.valor / total) * 100}%` }}
            title={p.rotulo}
          />
        ))}
    </div>
  );
}
