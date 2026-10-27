import type { BadgeTone } from "@/components/ui/badge";
import type { OrigemRecebimento, SituacaoFinanceiraAcordo, SituacaoParcela, StatusAcordo } from "@/types/db";

export const STATUS_ACORDO_LABEL: Record<StatusAcordo, { label: string; tone: BadgeTone }> = {
  ativo: { label: "Ativo", tone: "blue" },
  quitado: { label: "Quitado", tone: "green" },
  renegociado: { label: "Renegociado", tone: "amber" },
  cancelado: { label: "Cancelado", tone: "gray" },
};

export const SITUACAO_PARCELA_LABEL: Record<SituacaoParcela, { label: string; tone: BadgeTone }> = {
  recebida: { label: "Recebida", tone: "green" },
  parcial: { label: "Parcial", tone: "amber" },
  a_vencer: { label: "A vencer", tone: "gray" },
  em_carencia: { label: "Em carência", tone: "amber" },
  parcial_atrasada: { label: "Parcial em atraso", tone: "red" },
  atrasada: { label: "Atrasada", tone: "red" },
};

export const SITUACAO_ACORDO_LABEL: Record<SituacaoFinanceiraAcordo, { label: string; tone: BadgeTone }> = {
  sem_parcelas: { label: "Sem parcelas", tone: "gray" },
  quitado: { label: "Quitado", tone: "green" },
  em_atraso: { label: "Em atraso", tone: "red" },
  em_carencia: { label: "Em carência", tone: "amber" },
  em_dia: { label: "Em dia", tone: "blue" },
};

export const ORIGEM_RECEBIMENTO_LABEL: Record<OrigemRecebimento, string> = {
  manual: "Lançamento manual",
  extrato: "Extrato bancário",
};
