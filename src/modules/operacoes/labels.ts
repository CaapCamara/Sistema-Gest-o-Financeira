import type { BadgeTone } from "@/components/ui/badge";
import type { CotaOperacao, DestinoOperacao } from "@/types/db";

export const DESTINO_LABEL: Record<DestinoOperacao, { label: string; tone: BadgeTone }> = {
  emprestimo: { label: "Juros do empréstimo", tone: "blue" },
  reserva: { label: "Reserva", tone: "green" },
  remanescente: { label: "Remanescente", tone: "violet" },
};

export const COTA_LABEL: Record<CotaOperacao, string> = {
  emprestimo: "Cota de juros sem juros a pagar",
  reserva: "Cota de reserva",
  livre: "Percentual livre",
};
