import { z } from "zod";
import { zDate, zMoney, zPercent, zTextoOpcional } from "@/lib/zod-br";

export const STATUS_EMPRESTIMO = ["ativo", "quitado", "renegociado", "cancelado"] as const;

export const emprestimoSchema = z
  .object({
    credor_id: z.string().uuid("Selecione o credor."),
    valor_principal: zMoney({ positivo: true }),
    taxa_percentual: zPercent(),
    data_inicio: zDate(),
    data_vencimento_principal: zDate(),
    prazo_meses: z.coerce
      .number({ invalid_type_error: "Informe o prazo." })
      .int("Use um número inteiro de meses.")
      .min(1, "Prazo mínimo de 1 mês.")
      .max(600, "Prazo máximo de 600 meses."),
    juros_contratados_total: zMoney({ min: 0 }),
    valor_mensal_pagamento_planejado: zMoney({ min: 0 }),
    valor_mensal_reserva_planejado: zMoney({ min: 0 }),
    status: z.enum(STATUS_EMPRESTIMO),
    observacoes: zTextoOpcional(),
  })
  .refine((v) => v.data_vencimento_principal > v.data_inicio, {
    path: ["data_vencimento_principal"],
    message: "O vencimento do principal deve ser posterior à data de início.",
  });

export type EmprestimoInput = z.input<typeof emprestimoSchema>;

export const pagamentoSchema = z
  .object({
    data_pagamento: zDate(),
    valor_total: zMoney({ positivo: true }),
    modo: z.enum(["automatico", "manual"]),
    valor_juros: z.string().optional(),
    valor_principal: z.string().optional(),
    forma_pagamento: zTextoOpcional(),
    origem_reserva: z.boolean().default(false),
    observacoes: zTextoOpcional(),
  })
  .transform((v, ctx) => {
    if (v.modo === "automatico") return { ...v, valor_juros: null, valor_principal: null };
    const juros = zMoney({ min: 0 }).safeParse(v.valor_juros || "0");
    const principal = zMoney({ min: 0 }).safeParse(v.valor_principal || "0");
    if (!juros.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valor_juros"], message: "Valor inválido." });
    if (!principal.success)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valor_principal"], message: "Valor inválido." });
    if (!juros.success || !principal.success) return z.NEVER;
    const soma = Math.round((Number(juros.data) + Number(principal.data)) * 100);
    if (soma !== Math.round(Number(v.valor_total) * 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valor_principal"],
        message: "Juros + principal deve ser igual ao valor total.",
      });
      return z.NEVER;
    }
    return { ...v, valor_juros: juros.data, valor_principal: principal.data };
  });

export type PagamentoInput = z.input<typeof pagamentoSchema>;

export const reservaSchema = z.object({
  tipo: z.enum(["aporte", "resgate"]),
  data_movimento: zDate(),
  valor: zMoney({ positivo: true }),
  conta: zTextoOpcional(),
  observacoes: zTextoOpcional(),
});

export type ReservaInput = z.input<typeof reservaSchema>;

export const estornoSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo do estorno.").max(500),
});

export type EmprestimoOutput = z.output<typeof emprestimoSchema>;
export type PagamentoOutput = z.output<typeof pagamentoSchema>;
export type ReservaOutput = z.output<typeof reservaSchema>;
