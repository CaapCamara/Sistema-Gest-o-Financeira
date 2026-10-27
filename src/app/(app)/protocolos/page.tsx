import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatDateBR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { tomStatusProtocolo } from "@/modules/protocolos/labels";
import type { ProtocoloView } from "@/types/db";

export const metadata: Metadata = { title: "Protocolos GOV" };

const FILTROS = [
  { valor: "", label: "Todos" },
  { valor: "pendentes", label: "Pendentes" },
  { valor: "sem_nupe", label: "Sem NUPE" },
  { valor: "meus", label: "Sob minha responsabilidade" },
];

export default async function ProtocolosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro = "" } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfil();

  let query = supabase.from("vw_protocolos").select("*").order("criado_em", { ascending: false });
  if (filtro === "pendentes") query = query.eq("pendente", true);
  if (filtro === "sem_nupe") query = query.is("nupe", null);
  if (filtro === "meus" && perfil) query = query.eq("responsavel_id", perfil.id);
  const { data } = await query;
  const lista = (data ?? []) as ProtocoloView[];

  return (
    <>
      <PageHeader
        title="Protocolos GOV"
        description="Controle manual dos protocolos no GOV. Um protocolo pode abranger vários processos."
        actions={
          podeEditar(perfil) && (
            <Link href="/protocolos/novo" className={buttonClasses()}>
              <Plus className="h-4 w-4" /> Novo protocolo
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={f.valor ? `/protocolos?filtro=${f.valor}` : "/protocolos"}
            className={buttonClasses(filtro === f.valor ? "primary" : "secondary", "sm")}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>NUPE</Th>
              <Th>Data do protocolo</Th>
              <Th>Processos</Th>
              <Th>Responsável</Th>
              <Th>Assunto</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={7}>Nenhum protocolo encontrado.</EmptyRow>}
            {lista.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/protocolos/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.codigo}
                  </Link>
                </Td>
                <Td>{p.nupe ?? <span className="text-amber-700">sem NUPE</span>}</Td>
                <Td>{formatDateBR(p.data_protocolo)}</Td>
                <Td className="max-w-[16rem] truncate" title={p.processos}>
                  {p.qtd_processos} · {p.processos || "—"}
                </Td>
                <Td>{p.responsavel_nome ?? "—"}</Td>
                <Td className="max-w-[16rem] truncate" title={p.assunto ?? undefined}>{p.assunto ?? "—"}</Td>
                <Td>
                  <Badge tone={tomStatusProtocolo(p.pendente)}>{p.status_nome}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
