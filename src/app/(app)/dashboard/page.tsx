import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CircleCheck,
  FileCheck2,
  FileWarning,
  Handshake,
  Landmark,
  Plus,
} from "lucide-react";
import { addDays, endOfMonth, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { garantirCompetencias } from "@/modules/emprestimos/queries/competencias";
import { formatBRL, money, sum } from "@/lib/money";
import { formatDateBR, hojeISO, parseDateOnly, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar, SplitBar } from "@/components/ui/progress";
import { buttonClasses } from "@/components/ui/button";
import { mesPorExtenso, situacaoJuros } from "@/modules/emprestimos/components/resumo-emprestimo";
import type { AcordoPosicao, CoberturaEmprestimo, Competencia, EmprestimoPosicao, ParcelaPosicao } from "@/types/db";

export const metadata: Metadata = { title: "Painel" };

const SELO = {
  ok: "bg-emerald-100 text-emerald-700 ring-emerald-300",
  atencao: "bg-amber-100 text-amber-700 ring-amber-300",
  atraso: "bg-red-100 text-red-700 ring-red-300",
  neutro: "bg-slate-100 text-slate-700 ring-slate-300",
} as const;

function Secao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-slate-950">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  await garantirCompetencias(supabase);
  const hoje = hojeISO();
  const d = parseDateOnly(hoje);
  const inicioMes = toISODate(startOfMonth(d));
  const fimMes = toISODate(endOfMonth(d));
  const em30 = toISODate(addDays(d, 30));

  const [
    { data: pos },
    { data: proximos },
    { data: acordosData },
    { data: parcelasProximas },
    { count: protocolosPendentes },
    { count: processosSemNupe },
    { data: coberturas },
    { data: destinacoesMes },
  ] = await Promise.all([
    supabase.from("vw_emprestimo_posicao").select("*").order("codigo"),
    supabase.from("vw_competencias").select("*").gt("juros_em_aberto", 0).lte("data_vencimento", em30).order("data_vencimento").limit(50),
    supabase.from("vw_acordo_posicao").select("*").eq("status", "ativo"),
    supabase
      .from("vw_acordo_parcelas")
      .select("*")
      .eq("acordo_status", "ativo")
      .gt("saldo", 0)
      .lte("data_vencimento", em30)
      .order("data_vencimento")
      .limit(50),
    supabase.from("vw_protocolos").select("id", { count: "exact", head: true }).eq("pendente", true),
    supabase.from("vw_processo_resumo").select("id", { count: "exact", head: true }).eq("status", "ativo").eq("tem_nupe", false),
    supabase.from("vw_emprestimo_cobertura").select("*"),
    supabase
      .from("operacao_destinacoes")
      .select("destino, valor")
      .is("estornado_em", null)
      .gte("data_destinacao", inicioMes)
      .lte("data_destinacao", fimMes),
  ]);

  const ativos = ((pos ?? []) as EmprestimoPosicao[]).filter((e) => e.status === "ativo");
  const idsAtivos = new Set(ativos.map((e) => e.id));
  const porId = new Map(ativos.map((e) => [e.id, e]));
  const coberturaPorEmprestimo = new Map(((coberturas ?? []) as CoberturaEmprestimo[]).map((c) => [c.emprestimo_id, c]));

  // Entrou no mês, e para onde foi
  const destMes = (destinacoesMes ?? []) as { destino: "emprestimo" | "reserva" | "remanescente"; valor: string | number }[];
  const fluxoJuros = sum(destMes.filter((x) => x.destino === "emprestimo").map((x) => x.valor));
  const fluxoReserva = sum(destMes.filter((x) => x.destino === "reserva").map((x) => x.valor));
  const fluxoSobra = sum(destMes.filter((x) => x.destino === "remanescente").map((x) => x.valor));
  const fluxoTotal = fluxoJuros.plus(fluxoReserva).plus(fluxoSobra);

  // O que precisa de atenção (só aparece o que existe)
  const acordosAtivos = (acordosData ?? []) as AcordoPosicao[];
  const acordoPorId = new Map(acordosAtivos.map((a) => [a.id, a]));
  const emprestimosAtrasados = ativos.filter((e) => e.em_atraso);
  const parcelasAtrasadas = acordosAtivos.reduce((n, a) => n + a.parcelas_atrasadas, 0);
  const valorAtrasado = sum(acordosAtivos.map((a) => a.valor_atrasado));
  const alertas = [
    emprestimosAtrasados.length > 0 && {
      href: "/emprestimos",
      icone: AlertTriangle,
      tom: "atraso" as const,
      texto: `${emprestimosAtrasados.length} empréstimo(s) com juros atrasados`,
    },
    parcelasAtrasadas > 0 && {
      href: "/acordos",
      icone: Handshake,
      tom: "atraso" as const,
      texto: `${parcelasAtrasadas} parcela(s) de acordo atrasada(s) · ${formatBRL(valorAtrasado)}`,
    },
    (protocolosPendentes ?? 0) > 0 && {
      href: "/protocolos?filtro=pendentes",
      icone: FileCheck2,
      tom: "atencao" as const,
      texto: `${protocolosPendentes} protocolo(s) pendente(s)`,
    },
    (processosSemNupe ?? 0) > 0 && {
      href: "/processos?filtro=sem_nupe",
      icone: FileWarning,
      tom: "atencao" as const,
      texto: `${processosSemNupe} processo(s) sem NUPE`,
    },
  ].filter(Boolean) as { href: string; icone: typeof AlertTriangle; tom: "atraso" | "atencao"; texto: string }[];

  // Próximos 30 dias
  const aReceber = (parcelasProximas ?? []) as ParcelaPosicao[];
  const aPagar = ((proximos ?? []) as Competencia[]).filter((c) => idsAtivos.has(c.emprestimo_id));

  return (
    <>
      <PageHeader title="Painel" description={`Hoje, ${formatDateBR(hoje)}`} />

      {/* Quanto entrou este mês e para onde foi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Entrou dos acordos em {mesPorExtenso(hoje)}</p>
            <p className="font-display tabular mt-1 text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">{formatBRL(fluxoTotal)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { rotulo: "Pagou juros", valor: fluxoJuros, cor: "bg-juros-700" },
              { rotulo: "Guardou na reserva", valor: fluxoReserva, cor: "bg-emerald-600" },
              { rotulo: "Sobrou", valor: fluxoSobra, cor: "bg-rem-600" },
            ].map((x) => (
              <span key={x.rotulo} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200">
                <span className={cn("h-2.5 w-2.5 rounded-full", x.cor)} aria-hidden />
                {x.rotulo}
                <span className="tabular font-bold text-slate-950">{formatBRL(x.valor)}</span>
              </span>
            ))}
          </div>
        </div>
        <SplitBar
          className="mt-6 h-4"
          partes={[
            { valor: fluxoJuros.toNumber(), tone: "juros", rotulo: "Pagou juros" },
            { valor: fluxoReserva.toNumber(), tone: "green", rotulo: "Guardou na reserva" },
            { valor: fluxoSobra.toNumber(), tone: "rem", rotulo: "Sobrou" },
          ]}
        />
      </section>

      {/* Cada empréstimo em um cartão */}
      <Secao
        titulo="Empréstimos"
        acao={
          <Link href="/emprestimos/novo" className={buttonClasses("secondary", "sm")}>
            <Plus className="h-4 w-4" /> Novo
          </Link>
        }
      >
        {ativos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
            <Landmark className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">Nenhum empréstimo ativo.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ativos.map((e) => {
              const c = coberturaPorEmprestimo.get(e.id) ?? null;
              const juros = situacaoJuros(c);
              const pctJuros = c && !money(c.juros_devido).isZero() ? money(c.juros_pago).dividedBy(c.juros_devido).times(100).toNumber() : 100;
              const pctReserva = money(e.principal_devido).isZero()
                ? 100
                : Math.min(100, money(e.reserva_saldo).dividedBy(e.valor_principal).times(100).toNumber());
              return (
                <Link
                  key={e.id}
                  href={`/emprestimos/${e.id}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold text-slate-950 group-hover:text-brand-700">{e.codigo}</p>
                      <p className="truncate text-sm text-slate-500">{e.credor_nome}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", SELO[juros.situacao])}>
                      {juros.situacao === "ok" && <CircleCheck className="mr-1 inline h-3.5 w-3.5" />}
                      Juros {juros.texto.toLowerCase()}
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-slate-600">{c ? `Juros de ${mesPorExtenso(c.data_vencimento)}` : "Juros"}</span>
                        <span className="tabular text-slate-500">
                          <span className="font-bold text-slate-950">{formatBRL(c?.juros_pago ?? 0)}</span> de {formatBRL(c?.juros_devido ?? 0)}
                        </span>
                      </div>
                      <ProgressBar value={pctJuros} tone={juros.situacao === "atraso" ? "red" : juros.situacao === "ok" ? "brand" : "juros"} />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-slate-600">Reserva para quitar</span>
                        <span className="tabular text-slate-500">
                          <span className="font-bold text-emerald-700">{formatBRL(e.reserva_saldo)}</span> de {formatBRL(e.valor_principal)}
                        </span>
                      </div>
                      <ProgressBar value={pctReserva} tone="green" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Secao>

      {/* Só o que precisa de atenção */}
      <Secao titulo="Precisa de atenção">
        {alertas.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-700">
            <CircleCheck className="h-6 w-6" />
            <span className="font-semibold">Tudo em dia</span>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {alertas.map((a) => {
              const Icone = a.icone;
              return (
                <li key={a.texto}>
                  <Link
                    href={a.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold ring-1 ring-inset hover:brightness-125",
                      SELO[a.tom],
                    )}
                  >
                    <Icone className="h-5 w-5 shrink-0" />
                    {a.texto}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {/* Próximos 30 dias */}
      <Secao titulo="Próximos 30 dias">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white">
            <p className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
              <ArrowDownLeft className="h-4 w-4 text-brand-600" /> A receber dos acordos
            </p>
            {aReceber.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Nada a receber.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {aReceber.slice(0, 8).map((p) => {
                  const a = acordoPorId.get(p.acordo_id);
                  return (
                    <li key={p.id}>
                      <Link href={`/acordos/${p.acordo_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{a?.numero_processo ?? a?.processo_codigo}</span>
                          <span className={cn("text-xs", p.atrasada ? "font-semibold text-red-700" : "text-slate-500")}>
                            {p.atrasada ? "Atrasada · " : ""}parcela {p.numero} · {formatDateBR(p.data_vencimento)}
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-bold text-brand-700">{formatBRL(p.saldo)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <p className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
              <ArrowUpRight className="h-4 w-4 text-slate-500" /> A pagar aos credores
            </p>
            {aPagar.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Nada a pagar.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {aPagar.slice(0, 8).map((c) => {
                  const e = porId.get(c.emprestimo_id);
                  return (
                    <li key={c.id}>
                      <Link href={`/emprestimos/${c.emprestimo_id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {e?.codigo} · juros de {mesPorExtenso(c.data_vencimento)}
                          </span>
                          <span className={cn("text-xs", c.vencida ? "font-semibold text-red-700" : "text-slate-500")}>
                            {c.vencida ? "Atrasado · " : ""}vence {formatDateBR(c.data_vencimento)}
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-bold text-slate-950">{formatBRL(c.juros_em_aberto)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Secao>
    </>
  );
}
