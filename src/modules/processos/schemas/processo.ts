import { z } from "zod";
import { zDateOpcional, zTextoOpcional } from "@/lib/zod-br";

export const STATUS_PROCESSO = ["ativo", "encerrado", "arquivado"] as const;
export const POLOS = ["requerente", "requerido"] as const;

export const parteSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().uuid().safeParse(v).success, "Identificador inválido."),
  polo: z.enum(POLOS),
  nome: z.string().trim().min(2, "Informe o nome.").max(200),
  tipo_pessoa: z.enum(["PF", "PJ"]),
  documento: zTextoOpcional(),
  contato: zTextoOpcional(),
});

export const processoSchema = z
  .object({
    numero_processo: zTextoOpcional(),
    data_audiencia: zDateOpcional(),
    status: z.enum(STATUS_PROCESSO),
    observacoes: zTextoOpcional(),
    partes: z.array(parteSchema).max(50, "Máximo de 50 partes."),
  })
  .superRefine((v, ctx) => {
    for (const polo of POLOS) {
      if (!v.partes.some((p) => p.polo === polo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["partes"],
          message: polo === "requerente" ? "Informe ao menos um requerente." : "Informe ao menos um requerido.",
        });
      }
    }
  });

export type ProcessoInput = z.input<typeof processoSchema>;
export type ProcessoOutput = z.output<typeof processoSchema>;
