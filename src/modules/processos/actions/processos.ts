"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import { zDate } from "@/lib/zod-br";
import { processoSchema, type ProcessoInput } from "../schemas/processo";
import type { ActionResult } from "@/types/db";

function revalidar(id?: string) {
  revalidatePath("/processos");
  revalidatePath("/acordos");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/processos/${id}`);
}

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await assertPodeEditar();
    return null;
  } catch (e) {
    return erroGenerico(e);
  }
}

export async function salvarProcesso(id: string | null, input: ProcessoInput): Promise<ActionResult<{ id: string }>> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = processoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const { partes, ...processo } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("processos").update(processo).eq("id", id).select("id").single()
    : await supabase.from("processos").insert(processo).select("id").single();
  if (error) return erroBanco(error);
  const processoId = data.id as string;

  // Sincroniza as partes: remove as retiradas, atualiza as existentes e inclui as novas.
  const manter = partes.filter((p) => p.id).map((p) => p.id!);
  let remover = supabase.from("processo_partes").delete().eq("processo_id", processoId);
  if (manter.length > 0) remover = remover.not("id", "in", `(${manter.join(",")})`);
  const { error: erroRemover } = await remover;
  if (erroRemover) return erroBanco(erroRemover);

  for (const { id: parteId, ...parte } of partes) {
    const { error: erroParte } = parteId
      ? await supabase.from("processo_partes").update(parte).eq("id", parteId).eq("processo_id", processoId)
      : await supabase.from("processo_partes").insert({ ...parte, processo_id: processoId });
    if (erroParte) return erroBanco(erroParte);
  }

  revalidar(processoId);
  return { ok: true, data: { id: processoId }, message: "Processo salvo." };
}

const anotacaoSchema = z.object({
  data_movimentacao: zDate(),
  descricao: z.string().trim().min(3, "Descreva a movimentação.").max(2000),
});

/** Anotação manual na linha do tempo do processo (imutável depois de gravada). */
export async function registrarAnotacao(
  processoId: string,
  input: z.input<typeof anotacaoSchema>,
): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = anotacaoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("processo_movimentacoes")
    .insert({ processo_id: processoId, tipo: "anotacao", ...parsed.data });
  if (error) return erroBanco(error);
  revalidatePath(`/processos/${processoId}`);
  return { ok: true, message: "Anotação registrada." };
}
