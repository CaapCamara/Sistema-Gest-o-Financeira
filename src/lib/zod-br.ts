import { z } from "zod";
import { parseDecimalBR } from "@/lib/money";
import { isISODate } from "@/lib/dates";

/** Valor monetário digitado (aceita "1.234,56"). Saída: string decimal canônica. */
export const zMoney = (opts: { min?: number; label?: string; positivo?: boolean } = {}) =>
  z
    .string({ required_error: "Campo obrigatório." })
    .transform((v, ctx) => {
      const parsed = parseDecimalBR(v);
      if (parsed === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um valor válido (ex.: 1.234,56)." });
        return z.NEVER;
      }
      const n = Number(parsed);
      if (opts.positivo && n <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O valor deve ser maior que zero." });
        return z.NEVER;
      }
      if (opts.min !== undefined && n < opts.min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `O valor mínimo é ${opts.min}.` });
        return z.NEVER;
      }
      if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use no máximo 2 casas decimais." });
        return z.NEVER;
      }
      return parsed;
    });

/** Percentual digitado ("10" ou "2,5"). Saída: string decimal do percentual. */
export const zPercent = () =>
  z.string({ required_error: "Campo obrigatório." }).transform((v, ctx) => {
    const parsed = parseDecimalBR(v);
    if (parsed === null || Number(parsed) < 0 || Number(parsed) >= 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um percentual entre 0 e 100." });
      return z.NEVER;
    }
    if (!/^\d+(\.\d{1,4})?$/.test(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use no máximo 4 casas decimais." });
      return z.NEVER;
    }
    return parsed;
  });

export const zDate = () =>
  z.string({ required_error: "Informe a data." }).refine(isISODate, "Informe uma data válida.");

export const zTextoOpcional = () =>
  z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((v) => (v ? v : null));
