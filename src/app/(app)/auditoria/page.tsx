import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/auth";
import { formatDateTimeBR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import type { RegistroAuditoria } from "@/types/db";

export const metadata: Metadata = { title: "Auditoria" };

const TONE = { INSERT: "green", UPDATE: "blue", DELETE: "red" } as const;

export default async function AuditoriaPage() {
  const perfil = await getPerfil();
  if (perfil?.papel !== "admin") redirect("/dashboard");
  const supabase = await createClient();
  const [{ data }, { data: perfis }] = await Promise.all([
    supabase.from("auditoria").select("*").order("criado_em", { ascending: false }).limit(300),
    supabase.from("perfis").select("id, nome, email"),
  ]);
  const registros = (data ?? []) as RegistroAuditoria[];
  const nomes = new Map((perfis ?? []).map((p) => [p.id, p.nome || p.email]));

  return (
    <>
      <PageHeader title="Auditoria" description="Últimas 300 alterações registradas automaticamente pelo banco de dados." />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Usuário</Th>
              <Th>Tabela</Th>
              <Th>Ação</Th>
              <Th>Registro</Th>
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 && <EmptyRow colSpan={5}>Sem registros.</EmptyRow>}
            {registros.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>{formatDateTimeBR(r.criado_em)}</Td>
                <Td>{r.usuario_id ? nomes.get(r.usuario_id) ?? r.usuario_id.slice(0, 8) : "sistema"}</Td>
                <Td>{r.tabela}</Td>
                <Td>
                  <Badge tone={TONE[r.acao]}>{r.acao}</Badge>
                </Td>
                <Td className="font-mono text-xs text-slate-500">{r.registro_id?.slice(0, 8)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
