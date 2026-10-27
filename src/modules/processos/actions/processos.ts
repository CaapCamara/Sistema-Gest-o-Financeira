"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
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

export async function excluirProcesso(id: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const supabase = await createClient();
  const { count } = await supabase
    .from("acordos")
    .select("id", { count: "exact", head: true })
    .eq("processo_id", id)
    .is("excluido_em", null);
  if ((count ?? 0) > 0)
    return { ok: false, error: "Processo com acordos não pode ser excluído. Altere o status para encerrado ou arquivado." };

  const { error } = await supabase.from("processos").update({ excluido_em: new Date().toISOString() }).eq("id", id);
  if (error) return erroBanco(error);
  revalidar();
  return { ok: true, message: "Processo excluído." };
}
