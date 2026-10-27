"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import { percentualParaFracao } from "../domain/juros";
import {
  emprestimoSchema,
  estornoSchema,
  pagamentoSchema,
  reservaSchema,
  type EmprestimoInput,
  type PagamentoInput,
  type ReservaInput,
} from "../schemas/emprestimo";
import type { ActionResult } from "@/types/db";

function revalidar(id?: string) {
  revalidatePath("/emprestimos");
  revalidatePath("/reservas");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/emprestimos/${id}`);
}

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await assertPodeEditar();
    return null;
  } catch (e) {
    return erroGenerico(e);
  }
}

export async function salvarEmprestimo(
  id: string | null,
  input: EmprestimoInput,
): Promise<ActionResult<{ id: string }>> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = emprestimoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const { taxa_percentual, ...resto } = parsed.data;
  const registro = { ...resto, taxa_juros_mensal: percentualParaFracao(taxa_percentual).toString() };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("emprestimos").update(registro).eq("id", id).select("id").single()
    : await supabase.from("emprestimos").insert(registro).select("id").single();
  if (error) return erroBanco(error);

  revalidar(data.id);
  return { ok: true, data: { id: data.id }, message: "Empréstimo salvo." };
}

export async function excluirEmprestimo(id: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const supabase = await createClient();
  const { count } = await supabase
    .from("pagamentos")
    .select("id", { count: "exact", head: true })
    .eq("emprestimo_id", id)
    .is("estornado_em", null);
  if ((count ?? 0) > 0)
    return { ok: false, error: "Empréstimo com pagamentos não pode ser excluído. Altere o status para cancelado ou quitado." };

  const { error } = await supabase.from("emprestimos").update({ excluido_em: new Date().toISOString() }).eq("id", id);
  if (error) return erroBanco(error);
  revalidar();
  return { ok: true };
}

export async function registrarPagamento(emprestimoId: string, input: PagamentoInput): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = pagamentoSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);
  const p = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pagamento", {
    p_emprestimo_id: emprestimoId,
    p_data_pagamento: p.data_pagamento,
    p_valor_total: p.valor_total,
    p_modo: p.modo,
    p_valor_juros: p.valor_juros,
    p_valor_principal: p.valor_principal,
    p_forma_pagamento: p.forma_pagamento,
    p_origem_reserva: p.origem_reserva,
    p_observacoes: p.observacoes,
  });
  if (error) return erroBanco(error);
  revalidar(emprestimoId);
  return { ok: true, message: "Pagamento registrado." };
}

export async function estornarPagamento(emprestimoId: string, pagamentoId: string, motivo: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = estornoSchema.safeParse({ motivo });
  if (!parsed.success) return erroValidacao(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_pagamento", { p_pagamento_id: pagamentoId, p_motivo: parsed.data.motivo });
  if (error) return erroBanco(error);
  revalidar(emprestimoId);
  return { ok: true, message: "Pagamento estornado." };
}

export async function registrarMovimentoReserva(emprestimoId: string, input: ReservaInput): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = reservaSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("reserva_movimentos").insert({ emprestimo_id: emprestimoId, ...parsed.data });
  if (error) return erroBanco(error);
  revalidar(emprestimoId);
  return { ok: true, message: "Movimento de reserva registrado." };
}

export async function estornarMovimentoReserva(
  emprestimoId: string,
  movimentoId: string,
  motivo: string,
): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = estornoSchema.safeParse({ motivo });
  if (!parsed.success) return erroValidacao(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_movimento_reserva", {
    p_movimento_id: movimentoId,
    p_motivo: parsed.data.motivo,
  });
  if (error) return erroBanco(error);
  revalidar(emprestimoId);
  return { ok: true, message: "Movimento estornado." };
}
