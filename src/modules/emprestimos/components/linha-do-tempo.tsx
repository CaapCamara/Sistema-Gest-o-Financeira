import Link from "next/link";
import { ArrowDownToLine, HandCoins, PiggyBank, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, money } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { mesPorExtenso } from "./resumo-emprestimo";
import type { DestinacaoView, MovimentoReserva, Pagamento } from "@/types/db";

interface Evento {
  id: string;
  data: string;
  ordem: string;
  tipo: "recebimento" | "pagamento" | "reserva";
  titulo: React.ReactNode;
  valor: number | string;
  partes?: { juros: number; reserva: number; remanescente: number };
  saida?: boolean;
}

const ICONE = {
  recebimento: { icone: HandCoins, cor: "bg-brand-100 text-brand-700 ring-brand-300" },
  pagamento: { icone: Receipt, cor: "bg-juros-100 text-juros-700 ring-juros-300" },
  reserva: { icone: PiggyBank, cor: "bg-emerald-100 text-emerald-700 ring-emerald-300" },
};

function Chip({ cor, rotulo, valor }: { cor: "juros" | "reserva" | "rem"; rotulo: string; valor: number }) {
  if (valor <= 0) return null;
  const estilo = {
    juros: "bg-juros-100 text-juros-700 ring-juros-300",
    reserva: "bg-emerald-100 text-emerald-700 ring-emerald-300",
    rem: "bg-rem-100 text-rem-700 ring-rem-300",
  }[cor];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset", estilo)}>
      {rotulo} <span className="tabular font-semibold">{formatBRL(valor)}</span>
    </span>
  );
}

/**
 * Tudo o que aconteceu com o empréstimo, do mais recente para o mais antigo,
 * em frases curtas: o que entrou, de onde veio e para onde foi.
 */
export function LinhaDoTempo({
  destinacoes,
  pagamentos,
  movimentos,
}: {
  destinacoes: DestinacaoView[];
  pagamentos: Pagamento[];
  movimentos: MovimentoReserva[];
}) {
  const eventos: Evento[] = [];

  // Recebimentos de acordos (uma linha por recebimento, somando as parcelas)
  const porRecebimento = new Map<string, Evento & { acordoId: string }>();
  for (const d of destinacoes) {
    const ev =
      porRecebimento.get(d.recebimento_id) ??
      ({
        id: d.recebimento_id,
        data: d.data_destinacao,
        ordem: d.recebimento_id,
        tipo: "recebimento",
        titulo: null,
        valor: 0,
        partes: { juros: 0, reserva: 0, remanescente: 0 },
        acordoId: d.acordo_id,
      } as Evento & { acordoId: string });
    ev.valor = money(ev.valor).plus(d.valor).toNumber();
    const chave = d.destino === "emprestimo" ? "juros" : d.destino;
    ev.partes![chave] = money(ev.partes![chave]).plus(d.valor).toNumber();
    ev.titulo = (
      <>
        Chegou do{" "}
        <Link href={`/acordos/${d.acordo_id}?aba=recebimentos`} className="font-semibold text-slate-950 hover:text-brand-700">
          {d.processo_codigo}
        </Link>
      </>
    );
    porRecebimento.set(d.recebimento_id, ev);
  }
  eventos.push(...porRecebimento.values());

  // Pagamentos feitos fora das operações (diretos ou com a reserva)
  for (const p of pagamentos) {
    if (p.estornado_em || p.recebimento_id) continue;
    eventos.push({
      id: p.id,
      data: p.data_pagamento,
      ordem: p.criado_em,
      tipo: "pagamento",
      titulo: p.origem_reserva ? "Pago ao credor com a reserva" : "Pago ao credor",
      valor: p.valor_total,
      saida: true,
    });
  }

  // Movimentos manuais da reserva (os de operação já aparecem no recebimento)
  for (const m of movimentos) {
    if (m.estornado_em || m.recebimento_id || m.pagamento_id) continue;
    eventos.push({
      id: m.id,
      data: m.data_movimento,
      ordem: m.criado_em,
      tipo: "reserva",
      titulo: m.tipo === "aporte" ? "Guardado na reserva" : "Retirado da reserva",
      valor: m.valor,
      saida: m.tipo !== "aporte",
    });
  }

  eventos.sort((a, b) => (a.data === b.data ? b.ordem.localeCompare(a.ordem) : b.data.localeCompare(a.data)));

  if (eventos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center">
        <ArrowDownToLine className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm text-slate-600">Nada aconteceu ainda.</p>
        <p className="mt-1 text-xs text-slate-500">Quando um acordo vinculado receber uma parcela, ela aparece aqui.</p>
      </div>
    );
  }

  // Agrupa por mês
  const grupos: { chave: string; rotulo: string; itens: Evento[] }[] = [];
  for (const ev of eventos) {
    const chave = ev.data.slice(0, 7);
    let g = grupos.find((x) => x.chave === chave);
    if (!g) {
      g = { chave, rotulo: `${mesPorExtenso(ev.data)} de ${ev.data.slice(0, 4)}`, itens: [] };
      grupos.push(g);
    }
    g.itens.push(ev);
  }

  return (
    <div className="space-y-8">
      {grupos.map((g) => (
        <section key={g.chave}>
          <h3 className="font-display mb-3 text-lg font-bold capitalize text-slate-950">{g.rotulo}</h3>
          <ol className="relative space-y-3 border-l border-slate-200 pl-6">
            {g.itens.map((ev) => {
              const { icone: Icone, cor } = ICONE[ev.tipo];
              return (
                <li key={ev.id} className="relative">
                  <span className={cn("absolute -left-[37px] top-3 flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset", cor)}>
                    <Icone className="h-3.5 w-3.5" />
                  </span>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm text-slate-700">{ev.titulo}</p>
                      <p className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500">{formatDateBR(ev.data)}</span>
                        <span className={cn("tabular text-lg font-bold", ev.saida ? "text-slate-800" : "text-brand-700")}>
                          {ev.saida ? "−" : "+"} {formatBRL(ev.valor)}
                        </span>
                      </p>
                    </div>
                    {ev.partes && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Chip cor="juros" rotulo="Pagou juros" valor={ev.partes.juros} />
                        <Chip cor="reserva" rotulo="Guardou" valor={ev.partes.reserva} />
                        <Chip cor="rem" rotulo="Sobrou" valor={ev.partes.remanescente} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
