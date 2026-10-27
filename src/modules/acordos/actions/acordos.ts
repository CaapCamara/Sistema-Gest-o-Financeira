"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import { acordoSchema, estornoSchema, recebimentoSchema, type AcordoInput, type RecebimentoInput } from "../schemas/acordo";
import type { ActionResult } from "@/types/db";

function revalidar(id?: string, processoId?: string) {
  revalidatePath("/acordos");
  revalidatePath("/processos");
  revalidatePath("/dashboard");
  revalidatePath("/operacoes");
  revalidatePath("/remanescente");
  revalidatePath("/emprestimos");
  revalidatePath("/reservas");
  if (id) revalidatePath(`/acordos/${id}`);
  if (processoId) revalidatePath(`/processos/${processoId}`);
}

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await assertPodeEditar();
    return null;
  } catch (e) {
    return erroGenerico(e);
  }
}

/**
 * Salva o acordo e, quando `alterarParcelas` for verdadeiro, substitui as parcelas.
 * Com recebimentos registrados, o banco recusa a alteração das parcelas.
 */
export async function salvarAcordo(
  id: string | null,
  input: AcordoInput,
  alterarParcelas: boolean,
): Promise<ActionResult<{ id: string }>> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = acordoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const { parcelas, ...acordo } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("acordos").update(acordo).eq("id", id).select("id").single()
    : await supabase.from("acordos").insert(acordo).select("id").single();
  if (error) return erroBanco(error);
  const acordoId = data.id as string;

  if (alterarParcelas || !id) {
    const { error: erroParcelas } = await supabase.rpc("definir_parcelas", {
      p_acordo_id: acordoId,
      p_parcelas: parcelas,
    });
    if (erroParcelas) {
      // Um acordo novo sem parcelas válidas não deve ficar cadastrado pela metade.
      if (!id) await supabase.from("acordos").update({ excluido_em: new Date().toISOString() }).eq("id", acordoId);
      return erroBanco(erroParcelas);
    }
  }

  revalidar(acordoId, acordo.processo_id);
  return { ok: true, data: { id: acordoId }, message: "Acordo salvo." };
}

export async function excluirAcordo(id: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const supabase = await createClient();
  const { count } = await supabase
    .from("acordo_recebimentos")
    .select("id", { count: "exact", head: true })
    .eq("acordo_id", id)
    .is("estornado_em", null);
  if ((count ?? 0) > 0)
    return { ok: false, error: "Acordo com recebimentos não pode ser excluído. Altere o status para cancelado." };

  const { error } = await supabase.from("acordos").update({ excluido_em: new Date().toISOString() }).eq("id", id);
  if (error) return erroBanco(error);
  revalidar();
  return { ok: true, message: "Acordo excluído." };
}

export async function registrarRecebimento(acordoId: string, input: RecebimentoInput): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = recebimentoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);
  const r = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_recebimento", {
    p_acordo_id: acordoId,
    p_data_recebimento: r.data_recebimento,
    p_valor: r.valor,
    p_parcela_id: r.parcela_id,
    p_forma_pagamento: r.forma_pagamento,
    p_observacoes: r.observacoes,
    p_origem: "manual",
    p_referencia_externa: r.referencia_externa,
  });
  if (error) return erroBanco(error);
  revalidar(acordoId);
  return { ok: true, message: "Recebimento registrado." };
}

export async function estornarRecebimento(acordoId: string, recebimentoId: string, motivo: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = estornoSchema.safeParse({ motivo });
  if (!parsed.success) return erroValidacao(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_recebimento", {
    p_recebimento_id: recebimentoId,
    p_motivo: parsed.data.motivo,
  });
  if (error) return erroBanco(error);
  revalidar(acordoId);
  return { ok: true, message: "Recebimento estornado." };
}
