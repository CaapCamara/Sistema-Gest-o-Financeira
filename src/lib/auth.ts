import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/types/db";

/** Perfil do usuário logado (cacheado por requisição). */
export const getPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("perfis").select("*").eq("id", user.id).single();
  return (data as Perfil | null) ?? null;
});

export async function requirePerfil(): Promise<Perfil> {
  const perfil = await getPerfil();
  if (!perfil || !perfil.ativo) redirect("/login");
  return perfil;
}

export function podeEditar(perfil: Pick<Perfil, "papel" | "ativo"> | null): boolean {
  return !!perfil && perfil.ativo && (perfil.papel === "admin" || perfil.papel === "operador");
}

/** Para Server Actions: lança erro se o usuário não puder editar. RLS reforça no banco. */
export async function assertPodeEditar(): Promise<Perfil> {
  const perfil = await getPerfil();
  if (!podeEditar(perfil)) throw new Error("Você não tem permissão para esta operação.");
  return perfil!;
}
