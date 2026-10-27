import { z } from "zod";
import { money, parseDecimalBR } from "@/lib/money";
import { zDateOpcional, zTextoOpcional } from "@/lib/zod-br";

/** Percentual de 0 a 100 com até 2 casas ("50", "33,33"). Saída: string decimal. */
const zPercentual = () =>
  z.string({ required_error: "Campo obrigatório." }).transform((v, ctx) => {
    const parsed = parseDecimalBR(v === "" ? "0" : v);
    if (parsed === null || Number(parsed) < 0 || Number(parsed) > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um percentual entre 0 e 100." });
      return z.NEVER;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use no máximo 2 casas decimais." });
      return z.NEVER;
    }
    return parsed;
  });

export const operacaoSchema = z
  .object({
    acordo_id: z.string().uuid("Acordo inválido."),
    emprestimo_id: z.string().uuid("Selecione o empréstimo."),
    percentual_emprestimo: zPercentual(),
    percentual_reserva: zPercentual(),
    observacoes: zTextoOpcional(),
  })
  .superRefine((v, ctx) => {
    const soma = money(v.percentual_emprestimo).plus(v.percentual_reserva);
    if (soma.lte(0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["percentual_emprestimo"],
        message: "Informe ao menos um percentual.",
      });
    }
    if (soma.gt(100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["percentual_reserva"],
        message: "A soma dos percentuais não pode passar de 100%.",
      });
    }
  });

export type OperacaoInput = z.input<typeof operacaoSchema>;
export type OperacaoOutput = z.output<typeof operacaoSchema>;

export const motivoSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo (mínimo de 3 caracteres).").max(1000),
});

export const quitacaoSchema = z.object({
  data: zDateOpcional(),
});
