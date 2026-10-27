"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar, getPerfil } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import {
  protocoloSchema,
  statusProtocoloSchema,
  type ProtocoloInput,
  type StatusProtocoloInput,
} from "../schemas/protocolo";
import type { ActionResult } from "@/types/db";

function revalidar(id?: string) {
  revalidatePath("/protocolos");
  revalidatePath("/processos", "layout");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/protocolos/${id}`);
}

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await assertPodeEditar();
    return null;
  } catch (e) {
    return erroGenerico(e);
  }
}

export async function salvarProtocolo(id: string | null, input: ProtocoloInput): Promise<ActionResult<{ id: string }>> {
  const negado = await guard();
  if (negado) return negado;
  const parsed = protocoloSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const { processo_ids, ...protocolo } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("protocolos").update(protocolo).eq("id", id).select("id").single()
    : await supabase.from("protocolos").insert(protocolo).select("id").single();
  if (error) return erroBanco(error);
  const protocoloId = data.id as string;

  // Sincroniza os processos abrangidos (cada vínculo e desvínculo vira movimentação no processo).
  const { data: atuais, error: erroAtuais } = await supabase
    .from("protocolo_processos")
    .select("processo_id")
    .eq("protocolo_id", protocoloId);
  if (erroAtuais) return erroBanco(erroAtuais);
  const existentes = new Set((atuais ?? []).map((v) => v.processo_id as string));
  const desejados = new Set(processo_ids);

  const remover = [...existentes].filter((p) => !desejados.has(p));
  if (remover.length > 0) {
    const { error: e } = await supabase
      .from("protocolo_processos")
      .delete()
      .eq("protocolo_id", protocoloId)
      .in("processo_id", remover);
    if (e) return erroBanco(e);
  }
  const incluir = [...desejados].filter((p) => !existentes.has(p));
  if (incluir.length > 0) {
    const { error: e } = await supabase
      .from("protocolo_processos")
      .insert(incluir.map((processo_id) => ({ protocolo_id: protocoloId, processo_id })));
    if (e) return erroBanco(e);
  }

  revalidar(protocoloId);
  return { ok: true, data: { id: protocoloId }, message: "Protocolo salvo." };
}

export async function excluirProtocolo(id: string): Promise<ActionResult> {
  const negado = await guard();
  if (negado) return negado;
  const supabase = await createClient();
  const { error } = await supabase.from("protocolos").update({ excluido_em: new Date().toISOString() }).eq("id", id);
  if (error) return erroBanco(error);
  revalidar();
  return { ok: true, message: "Protocolo excluído." };
}

export async function salvarStatusProtocolo(id: string | null, input: StatusProtocoloInput): Promise<ActionResult> {
  const perfil = await getPerfil();
  if (perfil?.papel !== "admin" || !perfil.ativo) return { ok: false, error: "Somente administradores alteram os status." };
  const parsed = statusProtocoloSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("status_protocolo").update(parsed.data).eq("id", id)
    : await supabase.from("status_protocolo").insert(parsed.data);
  if (error) return erroBanco(error);
  revalidatePath("/configuracoes/status-protocolo");
  revalidar();
  return { ok: true, message: "Status salvo." };
}
