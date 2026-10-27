import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusProtocolo, Usuario } from "@/types/db";
import type { ProcessoOpcao } from "../components/protocolo-form";

/** Usuários ativos (perfis tem RLS restrita; a função expõe apenas id e nome). */
export async function listarUsuarios(supabase: SupabaseClient): Promise<Usuario[]> {
  const { data, error } = await supabase.rpc("listar_usuarios_ativos");
  if (error) console.error("[usuarios]", error.message);
  return (data ?? []) as Usuario[];
}

export async function dadosFormularioProtocolo(supabase: SupabaseClient) {
  const [{ data: processos }, { data: status }, usuarios] = await Promise.all([
    supabase
      .from("vw_processo_resumo")
      .select("id, codigo, numero_processo, requerentes, requeridos")
      .order("criado_em", { ascending: false }),
    supabase.from("status_protocolo").select("*").order("ordem").order("nome"),
    listarUsuarios(supabase),
  ]);
  return {
    processos: (processos ?? []) as ProcessoOpcao[],
    status: (status ?? []) as StatusProtocolo[],
    usuarios,
  };
}
