"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico } from "@/lib/actions";
import type { ActionResult } from "@/types/db";
import type { TipoExclusao } from "../types";

const entrada = z.object({
  tipo: z.enum(["credor", "emprestimo", "processo", "acordo"]),
  id: z.string().uuid(),
  motivo: z.string().trim().max(1000),
  extras: z
    .array(z.object({ tipo: z.enum(["credor", "emprestimo", "processo", "acordo"]), id: z.string().uuid() }))
    .max(50),
});

/**
 * Exclui o registro e tudo o que depende dele (no banco, numa transação) e,
 * depois, os caminhos que o usuário marcou na confirmação.
 */
export async function excluirComSelecao(
  tipo: TipoExclusao,
  id: string,
  motivo: string,
  extras: { tipo: TipoExclusao; id: string }[],
): Promise<ActionResult> {
  try {
    await assertPodeEditar();
  } catch (e) {
    return erroGenerico(e);
  }
  const parsed = entrada.safeParse({ tipo, id, motivo, extras });
  if (!parsed.success) return { ok: false, error: "Dados inválidos para exclusão." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_com_selecao", {
    p_tipo: parsed.data.tipo,
    p_id: parsed.data.id,
    p_motivo: parsed.data.motivo,
    p_extras: parsed.data.extras,
  });
  if (error) return erroBanco(error);

  for (const p of ["/dashboard", "/credores", "/emprestimos", "/processos", "/acordos", "/recebimentos", "/operacoes", "/reservas", "/remanescente", "/protocolos"]) {
    revalidatePath(p);
  }
  return { ok: true, message: "Excluído." };
}
