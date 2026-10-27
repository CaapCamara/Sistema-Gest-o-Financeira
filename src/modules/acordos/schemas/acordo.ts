import { z } from "zod";
import { zDate, zMoney, zTextoOpcional } from "@/lib/zod-br";
import { gerarParcelasIguais } from "../domain/parcelas";

export const STATUS_ACORDO = ["ativo", "quitado", "renegociado", "cancelado"] as const;

export const parcelaManualSchema = z.object({
  valor: zMoney({ positivo: true }),
  data_vencimento: zDate(),
});

export const acordoSchema = z
  .object({
    processo_id: z.string().uuid("Selecione o processo."),
    polo_pagador: z.enum(["requerente", "requerido"], { required_error: "Informe quem paga." }),
    valor_total: zMoney({ positivo: true }),
    dias_carencia: z.coerce
      .number({ invalid_type_error: "Informe os dias de carência." })
      .int("Use um número inteiro de dias.")
      .min(0, "Mínimo de 0 dias.")
      .max(365, "Máximo de 365 dias."),
    condicoes_pagamento: zTextoOpcional(),
    status: z.enum(STATUS_ACORDO),
    observacoes: zTextoOpcional(),
    modo_parcelas: z.enum(["automatico", "manual"]),
    quantidade_parcelas: z.coerce.number().optional(),
    primeiro_vencimento: z.string().optional(),
    parcelas: z.array(z.object({ valor: z.string(), data_vencimento: z.string() })).optional(),
  })
  .transform((v, ctx) => {
    const { quantidade_parcelas, primeiro_vencimento, parcelas: manuais, ...acordo } = v;
    let parcelas: { valor: string; data_vencimento: string }[] = [];
    let invalido = false;
    const erro = (path: (string | number)[], message: string) => {
      invalido = true;
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };

    if (v.modo_parcelas === "automatico") {
      const qtd = Number(quantidade_parcelas);
      if (!Number.isInteger(qtd) || qtd < 1 || qtd > 600) {
        erro(["quantidade_parcelas"], "Informe de 1 a 600 parcelas.");
      }
      if (!zDate().safeParse(primeiro_vencimento).success) {
        erro(["primeiro_vencimento"], "Informe o primeiro vencimento.");
      }
      if (invalido) return z.NEVER;
      parcelas = gerarParcelasIguais(v.valor_total, qtd, primeiro_vencimento!).map((p) => ({
        valor: p.valor.toFixed(2),
        data_vencimento: p.dataVencimento,
      }));
    } else {
      const lista = manuais ?? [];
      if (lista.length === 0) {
        erro(["parcelas"], "Informe ao menos uma parcela.");
        return z.NEVER;
      }
      lista.forEach((p, i) => {
        const r = parcelaManualSchema.safeParse(p);
        if (r.success) parcelas.push(r.data);
        else r.error.issues.forEach((issue) => erro(["parcelas", i, ...issue.path], issue.message));
      });
      if (invalido) return z.NEVER;
    }
    return { ...acordo, parcelas };
  });

export type AcordoInput = z.input<typeof acordoSchema>;
export type AcordoOutput = z.output<typeof acordoSchema>;

export const recebimentoSchema = z.object({
  data_recebimento: zDate(),
  valor: zMoney({ positivo: true }),
  parcela_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Parcela inválida."),
  forma_pagamento: zTextoOpcional(),
  referencia_externa: zTextoOpcional(),
  observacoes: zTextoOpcional(),
});

export type RecebimentoInput = z.input<typeof recebimentoSchema>;
export type RecebimentoOutput = z.output<typeof recebimentoSchema>;

export const estornoSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo do estorno.").max(500),
});
