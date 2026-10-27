import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garante as competências pós-vencimento (juros que continuam vencendo quando o
 * principal não foi quitado no prazo). Idempotente e barato; também roda
 * diariamente via pg_cron quando disponível.
 */
export async function garantirCompetencias(supabase: SupabaseClient, emprestimoId?: string) {
  const { error } = await supabase.rpc("atualizar_competencias_pos_vencimento", {
    p_emprestimo_id: emprestimoId ?? null,
  });
  if (error) console.error("[competencias]", error.message);
}
