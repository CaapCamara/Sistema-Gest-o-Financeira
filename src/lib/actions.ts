import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";
import type { ActionResult } from "@/types/db";

/** Converte erros do banco em mensagens para o usuário. Regras de negócio usam SQLSTATE P0001. */
export function erroBanco(error: PostgrestError | null | undefined): ActionResult<never> {
  if (!error) return { ok: false, error: "Erro desconhecido." };
  if (error.code === "P0001") return { ok: false, error: error.message };
  if (error.code === "42501") return { ok: false, error: "Você não tem permissão para esta operação." };
  if (error.code === "23505") return { ok: false, error: "Já existe um registro com estes dados." };
  if (error.code === "23514") return { ok: false, error: "Algum valor informado não atende às regras de validação." };
  console.error("[db]", error);
  return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
}

export function erroValidacao(error: ZodError): ActionResult<never> {
  return {
    ok: false,
    error: "Verifique os campos destacados.",
    fieldErrors: error.flatten().fieldErrors as Record<string, string[] | undefined>,
  };
}

export function erroGenerico(e: unknown): ActionResult<never> {
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
}
