import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, money, sum } from "@/lib/money";
import { formatDateBR, hojeISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SplitBar } from "@/components/ui/progress";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { mesPorExtenso } from "@/modules/emprestimos/components/resumo-emprestimo";
import type { DestinacaoView } from "@/types/db";

export const metadata: Metadata = { title: "Recebimentos" };

interface LinhaRecebimento {
  id: string;
  acordo_id: string;
  data_recebimento: string;
  valor: number | string;
  forma_pagamento: string | null;
  estornado_em: string | null;
  acordos: { codigo: string; processos: { codigo: string } | null } | null;
}

const CHIP = {
  emprestimo: { rotulo: "Pagou juros", cor: "bg-juros-100 text-juros-700 ring-juros-300" },
  reserva: { rotulo: "Guardou", cor: "bg-emerald-100 text-emerald-700 ring-emerald-300" },
  remanescente: { rotulo: "Sobrou", cor: "bg-rem-100 text-rem-700 ring-rem-300" },
} as const;

export default async function RecebimentosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acordo_recebimentos")
    .select("id, acordo_id, data_recebimento, valor, forma_pagamento, estornado_em, acordos!inner(codigo, excluido_em, processos(codigo))")
    .is("acordos.excluido_em", null)
    .order("data_recebimento", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(300);
  const recebimentos = (data ?? []) as unknown as LinhaRecebimento[];

  const ids = recebimentos.map((r) => r.id);
  const { data: dest } = ids.length
    ? await supabase
        .from("vw_operacao_destinacoes")
        .select("recebimento_id, destino, valor, emprestimo_id, emprestimo_codigo")
        .in("recebimento_id", ids)
        .is("estornado_em", null)
    : { data: [] };
  const destinacoes = (dest ?? []) as Pick<DestinacaoView, "recebimento_id" | "destino" | "valor" | "emprestimo_id" | "emprestimo_codigo">[];

  const porRecebimento = new Map<string, { emprestimo: number; reserva: number; remanescente: number; emprestimoId: string; emprestimoCodigo: string }>();
  for (const d of destinacoes) {
    const atual = porRecebimento.get(d.recebimento_id) ?? {
      emprestimo: 0,
      reserva: 0,
      remanescente: 0,
      emprestimoId: d.emprestimo_id,
      emprestimoCodigo: d.emprestimo_codigo,
    };
    atual[d.destino] = money(atual[d.destino]).plus(d.valor).toNumber();
    porRecebimento.set(d.recebimento_id, atual);
  }

  // Resumo do mês atual
  const mes = hojeISO().slice(0, 7);
  const doMes = recebimentos.filter((r) => !r.estornado_em && r.data_recebimento.startsWith(mes));
  const totalMes = sum(doMes.map((r) => r.valor));
  const parte = (k: "emprestimo" | "reserva" | "remanescente") =>
    sum(doMes.map((r) => porRecebimento.get(r.id)?.[k] ?? 0));
  const juros = parte("emprestimo");
  const reserva = parte("reserva");
  const sobra = parte("remanescente");
  const semOperacao = totalMes.minus(juros).minus(reserva).minus(sobra);

  return (
    <>
      <PageHeader
        etapa={{ numero: 3, nome: "Entradas" }}
        title="Recebimentos"
        description="Tudo o que entrou dos acordos, do mais recente para o mais antigo, e para onde foi cada valor. Para registrar um recebimento, abra o acordo."
      />

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Entrou em {mesPorExtenso(hojeISO())}</p>
        <p className="font-display tabular mt-1 text-[40px] font-bold leading-none tracking-tight text-slate-950">{formatBRL(totalMes)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["emprestimo", juros],
              ["reserva", reserva],
              ["remanescente", sobra],
            ] as const
          ).map(([k, v]) => (
            <span key={k} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset", CHIP[k].cor)}>
              {CHIP[k].rotulo} <span className="tabular font-semibold">{formatBRL(v)}</span>
            </span>
          ))}
          {semOperacao.gt(0) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-300">
              Sem operação <span className="tabular font-semibold">{formatBRL(semOperacao)}</span>
            </span>
          )}
        </div>
        <SplitBar
          className="mt-5 h-3"
          partes={[
            { valor: juros.toNumber(), tone: "juros", rotulo: "Pagou juros" },
            { valor: reserva.toNumber(), tone: "green", rotulo: "Guardou" },
            { valor: sobra.toNumber(), tone: "rem", rotulo: "Sobrou" },
          ]}
        />
      </section>

      <Card>
        <CardHeader title="Todos os recebimentos" description="Os 300 mais recentes. Recebimentos estornados aparecem riscados." />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Veio de</Th>
              <Th align="right">Valor</Th>
              <Th>Para onde foi</Th>
              <Th>Empréstimo</Th>
              <Th>Forma</Th>
            </tr>
          </thead>
          <tbody>
            {recebimentos.length === 0 && <EmptyRow colSpan={6}>Nenhum recebimento registrado ainda.</EmptyRow>}
            {recebimentos.map((r) => {
              const estornado = !!r.estornado_em;
              const d = porRecebimento.get(r.id);
              return (
                <tr key={r.id} className={cn("align-top hover:bg-slate-50/70", estornado && "text-slate-400")}>
                  <Td className={cn(estornado && "line-through")}>{formatDateBR(r.data_recebimento)}</Td>
                  <Td>
                    <Link href={`/acordos/${r.acordo_id}?aba=recebimentos`} className="font-medium text-slate-950 hover:text-brand-700">
                      {r.acordos?.processos?.codigo ?? "—"}
                    </Link>
                    <span className="block text-xs text-slate-500">{r.acordos?.codigo}</span>
                  </Td>
                  <Td align="right" className={cn("tabular font-semibold", estornado ? "line-through" : "text-brand-700")}>
                    {formatBRL(r.valor)}
                  </Td>
                  <Td className="whitespace-normal">
                    {estornado ? (
                      <Badge tone="gray">Estornado</Badge>
                    ) : d ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(["emprestimo", "reserva", "remanescente"] as const)
                          .filter((k) => d[k] > 0)
                          .map((k) => (
                            <span key={k} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset", CHIP[k].cor)}>
                              {CHIP[k].rotulo} <span className="tabular font-semibold">{formatBRL(d[k])}</span>
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Sem operação: não foi dividido</span>
                    )}
                  </Td>
                  <Td>
                    {d && !estornado ? (
                      <Link href={`/emprestimos/${d.emprestimoId}`} className="text-brand-700 hover:underline">
                        {d.emprestimoCodigo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-xs">{r.forma_pagamento ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
