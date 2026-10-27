import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { StatusProtocoloEditor } from "@/modules/protocolos/components/status-protocolo-editor";
import type { StatusProtocolo } from "@/types/db";

export const metadata: Metadata = { title: "Status de protocolo" };

export default async function StatusProtocoloPage() {
  const perfil = await getPerfil();
  if (perfil?.papel !== "admin") redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("status_protocolo").select("*").order("ordem").order("nome");
  const lista = (data ?? []) as StatusProtocolo[];

  return (
    <>
      <PageHeader
        title="Status de protocolo"
        description="Etapas do protocolo no GOV. Ajuste a lista conforme o fluxo real; status em uso não são apagados, apenas desativados."
        actions={<StatusProtocoloEditor />}
      />
      <Card className="max-w-3xl">
        <Table>
          <thead>
            <tr>
              <Th align="right">Ordem</Th>
              <Th>Nome</Th>
              <Th>Conta como pendente</Th>
              <Th>Situação</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={5}>Nenhum status cadastrado.</EmptyRow>}
            {lista.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td align="right">{s.ordem}</Td>
                <Td className="font-medium">{s.nome}</Td>
                <Td>{s.pendente ? <Badge tone="amber">Sim</Badge> : <Badge tone="green">Não</Badge>}</Td>
                <Td>{s.ativo ? <Badge tone="blue">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                <Td>
                  <StatusProtocoloEditor status={s} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
