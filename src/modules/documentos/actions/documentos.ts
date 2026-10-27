"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertPodeEditar } from "@/lib/auth";
import { erroBanco, erroGenerico, erroValidacao } from "@/lib/actions";
import { zTextoOpcional } from "@/lib/zod-br";
import { BUCKET_DOCUMENTOS, nomeSeguro, TAMANHO_MAXIMO, TIPOS_DOCUMENTO, TIPOS_MIME_PERMITIDOS } from "../regras";
import type { ActionResult, TipoDocumento } from "@/types/db";

const destinoSchema = z.object({
  entidade: z.enum(["processo", "protocolo"]),
  id: z.string().uuid(),
});

export type Destino = z.infer<typeof destinoSchema>;

const arquivoSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  mime: z.enum(TIPOS_MIME_PERMITIDOS, { errorMap: () => ({ message: "Tipo de arquivo não permitido." }) }),
  tamanho: z.number().int().positive().max(TAMANHO_MAXIMO, "O arquivo passa do limite de 20 MB."),
});

const registroSchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO as [TipoDocumento, ...TipoDocumento[]]),
  descricao: zTextoOpcional(),
  nome_arquivo: z.string().trim().min(1).max(255),
  storage_path: z.string().min(1).max(500),
  mime_type: z.enum(TIPOS_MIME_PERMITIDOS),
  tamanho_bytes: z.number().int().positive().max(TAMANHO_MAXIMO),
});

function pasta(destino: Destino) {
  return `${destino.entidade === "processo" ? "processos" : "protocolos"}/${destino.id}/`;
}

function revalidar(destino: Destino) {
  if (destino.entidade === "processo") revalidatePath(`/processos/${destino.id}`);
  else {
    revalidatePath(`/protocolos/${destino.id}`);
    revalidatePath("/processos", "layout");
  }
}

/**
 * Passo 1 do envio: o servidor define o caminho do arquivo e devolve uma URL de envio
 * assinada. O navegador envia o arquivo direto ao Storage (sem passar pelo servidor).
 */
export async function prepararEnvio(
  destino: Destino,
  arquivo: { nome: string; mime: string; tamanho: number },
): Promise<ActionResult<{ path: string; token: string }>> {
  try {
    await assertPodeEditar();
  } catch (e) {
    return erroGenerico(e);
  }
  const d = destinoSchema.safeParse(destino);
  if (!d.success) return { ok: false, error: "Destino inválido." };
  const a = arquivoSchema.safeParse(arquivo);
  if (!a.success) return { ok: false, error: a.error.issues[0]?.message ?? "Arquivo inválido." };

  const supabase = await createClient();
  const tabela = d.data.entidade === "processo" ? "processos" : "protocolos";
  const { data: alvo } = await supabase.from(tabela).select("id").eq("id", d.data.id).is("excluido_em", null).maybeSingle();
  if (!alvo) return { ok: false, error: "Registro não encontrado." };

  const path = `${pasta(d.data)}${randomUUID()}-${nomeSeguro(a.data.nome)}`;
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage]", error?.message);
    return { ok: false, error: "Não foi possível preparar o envio do arquivo." };
  }
  return { ok: true, data: { path: data.path, token: data.token } };
}

/** Passo 2 do envio: registra os metadados depois que o arquivo chegou ao Storage. */
export async function registrarDocumento(
  destino: Destino,
  input: z.input<typeof registroSchema>,
): Promise<ActionResult> {
  try {
    await assertPodeEditar();
  } catch (e) {
    return erroGenerico(e);
  }
  const d = destinoSchema.safeParse(destino);
  if (!d.success) return { ok: false, error: "Destino inválido." };
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) return erroValidacao(parsed.error);
  if (!parsed.data.storage_path.startsWith(pasta(d.data))) return { ok: false, error: "Caminho do arquivo inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("documentos").insert({
    ...parsed.data,
    processo_id: d.data.entidade === "processo" ? d.data.id : null,
    protocolo_id: d.data.entidade === "protocolo" ? d.data.id : null,
  });
  if (error) return erroBanco(error);
  revalidar(d.data);
  return { ok: true, message: "Documento anexado." };
}

/** Remoção lógica: o documento sai da lista, mas o arquivo e o registro permanecem no histórico. */
export async function removerDocumento(destino: Destino, documentoId: string, motivo: string): Promise<ActionResult> {
  try {
    await assertPodeEditar();
  } catch (e) {
    return erroGenerico(e);
  }
  const d = destinoSchema.safeParse(destino);
  if (!d.success) return { ok: false, error: "Destino inválido." };
  const m = z.string().trim().min(3, "Informe o motivo da remoção.").max(500).safeParse(motivo);
  if (!m.success) return { ok: false, error: m.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documentos")
    .update({ excluido_em: new Date().toISOString(), motivo_exclusao: m.data })
    .eq("id", documentoId)
    .is("excluido_em", null)
    .select("id");
  if (error) return erroBanco(error);
  if (!data || data.length === 0) return { ok: false, error: "Documento não encontrado ou já removido." };
  revalidar(d.data);
  return { ok: true, message: "Documento removido." };
}
