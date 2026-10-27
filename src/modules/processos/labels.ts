import type { BadgeTone } from "@/components/ui/badge";
import type { PoloProcesso, StatusProcesso } from "@/types/db";

export const STATUS_PROCESSO_LABEL: Record<StatusProcesso, { label: string; tone: BadgeTone }> = {
  ativo: { label: "Ativo", tone: "blue" },
  encerrado: { label: "Encerrado", tone: "green" },
  arquivado: { label: "Arquivado", tone: "gray" },
};

export const POLO_LABEL: Record<PoloProcesso, string> = {
  requerente: "Requerente",
  requerido: "Requerido",
};
