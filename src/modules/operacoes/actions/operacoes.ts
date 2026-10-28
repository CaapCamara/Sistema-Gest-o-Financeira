"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import { motivoSchema, operacaoSchema, quitacaoSchema, type OperacaoInput } from "../schemas/operacao";
import type { ActionResult } from "@/types/db";

function revalidar(ids: { acordoId?: string; emprestimoId?: string; processoId?: string } = {}) {
  revalidatePath("/operacoes");
  revalidatePath("/remanescente");
  revalidatePath("/dashboard");
  revalidatePath("/reservas");
  revalidatePath("/emprestimos");
  if (ids.acordoId) revalidatePath(`/acordos/${ids.acordoId}`);
  if (ids.emprestimoId) revalidatePath(`/emprestimos/${ids.emprestimoId}`);
  if (ids.processoId) revalidatePath(`/processos/${ids.processoId}`);
}

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await assertPodeEditar();
    return null;
  } catch (e) {
    return erroGenerico(e);
  }
}

export async function criarOperacao(input: OperacaoInput): Promise<ActionResult<{ id: string }>> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = operacaoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("operacoes").insert(parsed.data).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Este acordo já tem uma operação ativa. Encerre-a antes de criar outra." };
    return erroBanco(error);
  }

  const { data: acordo } = await supabase.from("acordos").select("processo_id").eq("id", parsed.data.acordo_id).maybeSingle();
  revalidar({
    acordoId: parsed.data.acordo_id,
    emprestimoId: parsed.data.emprestimo_id,
    processoId: (acordo?.processo_id as string | undefined) ?? undefined,
  });
  return { ok: true, data: { id: data.id as string }, message: "Operação criada." };
}

export async function encerrarOperacao(
  operacaoId: string,
  ids: { acordoId: string; emprestimoId: string },
  motivo: string,
): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = motivoSchema.safeParse({ motivo });
  if (!parsed.success) return erroValidacao(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("encerrar_operacao", { p_operacao_id: operacaoId, p_motivo: parsed.data.motivo });
  if (error) return erroBanco(error);
  revalidar(ids);
  return { ok: true, message: "Operação encerrada." };
}

export async function excluirOperacao(
  operacaoId: string,
  ids: { acordoId: string; emprestimoId: string },
  motivo: string,
): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = motivoSchema.safeParse({ motivo });
  if (!parsed.success) return erroValidacao(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_operacao", { p_operacao_id: operacaoId, p_motivo: parsed.data.motivo });
  if (error) return erroBanco(error);
  revalidar(ids);
  return { ok: true, message: "Operação excluída." };
}

export async function quitarPrincipalComReserva(emprestimoId: string, data: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = quitacaoSchema.safeParse({ data });
  if (!parsed.success) return erroValidacao(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_principal_com_reserva", {
    p_emprestimo_id: emprestimoId,
    p_data: parsed.data.data,
  });
  if (error) return erroBanco(error);
  revalidar({ emprestimoId });
  return { ok: true, message: "Principal quitado com a reserva." };
}
