import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OpcaoExclusao, TipoExclusao } from "./types";

/** O que a exclusão vai desfazer e quais caminhos ligados podem ser excluídos junto. */
export async function carregarPreviaExclusao(tipo: TipoExclusao, id: string) {
  const supabase = await createClient();
  const [{ data: previa }, { data: opcoes }] = await Promise.all([
    supabase.rpc("previa_exclusao", { p_tipo: tipo, p_id: id }),
    supabase.rpc("opcoes_exclusao", { p_tipo: tipo, p_id: id }),
  ]);
  return {
    previa: (previa ?? []) as string[],
    opcoes: (opcoes ?? []) as OpcaoExclusao[],
  };
}
