import { cn } from "@/lib/utils";

/** Marca: três barras do fluxo do dinheiro (juros, reserva, remanescente). */
export function Marca({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex h-9 w-9 items-end justify-center gap-[3px] rounded-xl bg-slate-100 p-2 ring-1 ring-slate-300", className)}
      aria-hidden
    >
      <span className="h-[55%] w-[5px] rounded-full bg-juros-700" />
      <span className="h-full w-[5px] rounded-full bg-emerald-600" />
      <span className="h-[35%] w-[5px] rounded-full bg-rem-600" />
    </span>
  );
}
