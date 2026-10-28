import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import type { Credor } from "@/types/db";

export const metadata: Metadata = { title: "Credores" };

export default async function CredoresPage() {
  const supabase = await createClient();
  const perfil = await getPerfil();
  const { data } = await supabase.from("credores").select("*").is("excluido_em", null).order("nome");
  const credores = (data ?? []) as Credor[];

  return (
    <>
      <PageHeader
        etapa={{ numero: 1, nome: "Empréstimo" }}
        title="Credores"
        description="Quem emprestou o dinheiro. É o primeiro cadastro: todo empréstimo começa por um credor."
        actions={
          podeEditar(perfil) && (
            <Link href="/credores/novo" className={buttonClasses()}>
              <Plus className="h-4 w-4" /> Novo credor
            </Link>
          )
        }
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Tipo</Th>
              <Th>Documento</Th>
              <Th>Contato</Th>
            </tr>
          </thead>
          <tbody>
            {credores.length === 0 && <EmptyRow colSpan={4}>Nenhum credor cadastrado.</EmptyRow>}
            {credores.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/credores/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.nome}
                  </Link>
                </Td>
                <Td>{c.tipo_pessoa}</Td>
                <Td>{c.documento ?? "—"}</Td>
                <Td className="text-slate-500">{[c.email, c.telefone].filter(Boolean).join(" · ") || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
