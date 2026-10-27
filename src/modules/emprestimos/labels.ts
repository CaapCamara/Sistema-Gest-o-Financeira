import type { BadgeTone } from "@/components/ui/badge";
import type { SituacaoCompetencia, StatusEmprestimo, TipoMovimentoReserva } from "@/types/db";

export const STATUS_LABEL: Record<StatusEmprestimo, { label: string; tone: BadgeTone }> = {
  ativo: { label: "Ativo", tone: "blue" },
  quitado: { label: "Quitado", tone: "green" },
  renegociado: { label: "Renegociado", tone: "amber" },
  cancelado: { label: "Cancelado", tone: "gray" },
};

export const SITUACAO_LABEL: Record<SituacaoCompetencia, { label: string; tone: BadgeTone }> = {
  paga: { label: "Juros pagos", tone: "green" },
  parcial: { label: "Parcial", tone: "amber" },
  a_vencer: { label: "A vencer", tone: "gray" },
  parcial_atrasada: { label: "Parcial em atraso", tone: "red" },
  atrasada: { label: "Em atraso", tone: "red" },
};

export const MOVIMENTO_RESERVA_LABEL: Record<TipoMovimentoReserva, string> = {
  aporte: "Aporte",
  resgate: "Resgate",
  utilizacao_pagamento: "Usada em pagamento",
};
