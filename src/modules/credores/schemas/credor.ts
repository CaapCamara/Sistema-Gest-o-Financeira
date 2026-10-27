import { z } from "zod";
import { zTextoOpcional } from "@/lib/zod-br";

function somenteDigitos(v: string) {
  return v.replace(/\D/g, "");
}

export const credorSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome do credor.").max(200),
    tipo_pessoa: z.enum(["PF", "PJ"]),
    documento: zTextoOpcional(),
    email: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido."),
    telefone: zTextoOpcional(),
    endereco: zTextoOpcional(),
    dados_bancarios: zTextoOpcional(),
    observacoes: zTextoOpcional(),
  })
  .superRefine((v, ctx) => {
    if (!v.documento) return;
    const d = somenteDigitos(v.documento);
    const esperado = v.tipo_pessoa === "PF" ? 11 : 14;
    if (d.length !== esperado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documento"],
        message: v.tipo_pessoa === "PF" ? "CPF deve ter 11 dígitos." : "CNPJ deve ter 14 dígitos.",
      });
    }
  });

export type CredorInput = z.input<typeof credorSchema>;
export type CredorOutput = z.output<typeof credorSchema>;
