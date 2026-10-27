import { z } from "zod";
import { zDateOpcional, zTextoOpcional } from "@/lib/zod-br";

export const protocoloSchema = z.object({
  nupe: zTextoOpcional(),
  data_protocolo: zDateOpcional(),
  status_id: z.string().uuid("Selecione o status."),
  responsavel_id: z.string().uuid("Selecione o responsável."),
  assunto: zTextoOpcional(),
  observacoes: zTextoOpcional(),
  processo_ids: z
    .array(z.string().uuid())
    .min(1, "Selecione ao menos um processo.")
    .max(500, "Máximo de 500 processos."),
});

export type ProtocoloInput = z.input<typeof protocoloSchema>;
export type ProtocoloOutput = z.output<typeof protocoloSchema>;

export const statusProtocoloSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do status.").max(100),
  ordem: z.coerce.number({ invalid_type_error: "Informe a ordem." }).int().min(0).max(9999),
  pendente: z.boolean(),
  ativo: z.boolean(),
});

export type StatusProtocoloInput = z.input<typeof statusProtocoloSchema>;
export type StatusProtocoloOutput = z.output<typeof statusProtocoloSchema>;
