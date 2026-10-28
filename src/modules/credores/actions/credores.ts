"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import { credorSchema, type CredorInput } from "../schemas/credor";
import type { ActionResult } from "@/types/db";

export async function salvarCredor(id: string | null, input: CredorInput): Promise<ActionResult<{ id: string }>> {
  try {
    await assertPodeEditar();
  } catch (e) {
    return erroGenerico(e);
  }
  const parsed = credorSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const supabase = await createClient();
  const query = id
    ? supabase.from("credores").update(parsed.data).eq("id", id).select("id").single()
    : supabase.from("credores").insert(parsed.data).select("id").single();
  const { data, error } = await query;
  if (error) return erroBanco(error);

  revalidatePath("/credores");
  return { ok: true, data: { id: data.id }, message: "Credor salvo." };
}

export async function excluirCredor(id: string): Promise<ActionResult> {
  try {
    await assertPodeEditar();
  } catch (e) {
    return erroGenerico(e);
  }
  const supabase = await createClient();
  const { data: emprestimos } = await supabase
    .from("emprestimos")
    .select("codigo")
    .eq("credor_id", id)
    .is("excluido_em", null)
    .order("codigo");
  if (emprestimos && emprestimos.length > 0)
    return {
      ok: false,
      error: `Este credor tem empréstimo cadastrado (${emprestimos.map((e) => e.codigo).join(", ")}). Exclua o empréstimo antes.`,
    };

  const { error } = await supabase.from("credores").update({ excluido_em: new Date().toISOString() }).eq("id", id);
  if (error) return erroBanco(error);
  revalidatePath("/credores");
  return { ok: true, message: "Credor excluído." };
}
