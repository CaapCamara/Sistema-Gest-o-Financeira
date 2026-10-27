import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { STATUS_PROCESSO_LABEL } from "@/modules/processos/labels";
import type { ProcessoResumo } from "@/types/db";

export const metadata: Metadata = { title: "Processos" };

const FILTROS = [
  { valor: "", label: "Todos" },
  { valor: "ativo", label: "Ativos" },
  { valor: "atraso", label: "Com parcelas atrasadas" },
  { valor: "sem_nupe", label: "Sem NUPE" },
  { valor: "encerrado", label: "Encerrados" },
  { valor: "arquivado", label: "Arquivados" },
];

export default async function ProcessosPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const { filtro = "", q = "" } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfil();

  let query = supabase.from("vw_processo_resumo").select("*").order("criado_em", { ascending: false });
  if (filtro === "ativo" || filtro === "encerrado" || filtro === "arquivado") query = query.eq("status", filtro);
  if (filtro === "atraso") query = query.eq("em_atraso", true);
  if (filtro === "sem_nupe") query = query.eq("tem_nupe", false).eq("status", "ativo");
  // Remove caracteres com significado no filtro do PostgREST
  const termo = q.replace(/[,()%*\\"]/g, " ").trim();
  if (termo) {
    const like = `%${termo}%`;
    query = query.or(
      `codigo.ilike.${like},numero_processo.ilike.${like},requerentes.ilike.${like},requeridos.ilike.${like},nupes.ilike.${like}`,
    );
  }
  const { data } = await query;
  const lista = (data ?? []) as ProcessoResumo[];

  const hrefFiltro = (valor: string) => {
    const params = new URLSearchParams();
    if (valor) params.set("filtro", valor);
    if (termo) params.set("q", termo);
    const s = params.toString();
    return s ? `/processos?${s}` : "/processos";
  };

  return (
    <>
      <PageHeader
        title="Processos"
        description="Processos e acordos entre partes acompanhados pelo sistema."
        actions={
          podeEditar(perfil) && (
            <Link href="/processos/novo" className={buttonClasses()}>
              <Plus className="h-4 w-4" /> Novo processo
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Link key={f.valor} href={hrefFiltro(f.valor)} className={buttonClasses(filtro === f.valor ? "primary" : "secondary", "sm")}>
            {f.label}
          </Link>
        ))}
        <form className="ml-auto flex w-full items-center gap-2 sm:w-auto" action="/processos">
          {filtro && <input type="hidden" name="filtro" value={filtro} />}
          <Input name="q" defaultValue={termo} placeholder="Número, código, parte ou NUPE" className="h-8 sm:w-64" aria-label="Buscar processos" />
          <button className={buttonClasses("secondary", "sm")} aria-label="Buscar">
            <Search className="h-4 w-4" />
          </button>
        </form>
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nº do processo</Th>
              <Th>Requerente(s)</Th>
              <Th>Requerido(s)</Th>
              <Th>Audiência</Th>
              <Th>NUPE</Th>
              <Th align="right">Acordos ativos</Th>
              <Th align="right">Recebido</Th>
              <Th align="right">Em aberto</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={10}>Nenhum processo encontrado.</EmptyRow>}
            {lista.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/processos/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.codigo}
                  </Link>
                </Td>
                <Td>{p.numero_processo ?? "—"}</Td>
                <Td className="max-w-[14rem] truncate" title={p.requerentes}>{p.requerentes || "—"}</Td>
                <Td className="max-w-[14rem] truncate" title={p.requeridos}>{p.requeridos || "—"}</Td>
                <Td>{formatDateBR(p.data_audiencia)}</Td>
                <Td className="max-w-[10rem] truncate" title={p.nupes}>
                  {p.nupes || <span className="text-amber-700">sem NUPE</span>}
                </Td>
                <Td align="right">
                  {p.qtd_acordos_ativos > 0 ? `${p.qtd_acordos_ativos} · ${formatBRL(p.valor_acordos_ativos)}` : "—"}
                </Td>
                <Td align="right" className="text-emerald-700">{formatBRL(p.recebido_acordos_ativos)}</Td>
                <Td align="right">{formatBRL(p.saldo_acordos_ativos)}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Badge tone={STATUS_PROCESSO_LABEL[p.status].tone}>{STATUS_PROCESSO_LABEL[p.status].label}</Badge>
                    {p.em_atraso && <Badge tone="red">{p.parcelas_atrasadas} atrasada(s)</Badge>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
