import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarClock, CircleCheck, PiggyBank, Receipt, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, money } from "@/lib/money";
import { formatDateBR, hojeISO } from "@/lib/dates";
import { ProgressBar } from "@/components/ui/progress";
import { QuitarReservaButton } from "@/modules/operacoes/components/quitar-reserva-button";
import type { CoberturaEmprestimo, EmprestimoPosicao, QuitacaoSugerida } from "@/types/db";

type Situacao = "ok" | "atencao" | "atraso" | "neutro";

const SELO: Record<Situacao, string> = {
  ok: "bg-emerald-100 text-emerald-700 ring-emerald-300",
  atencao: "bg-amber-100 text-amber-700 ring-amber-300",
  atraso: "bg-red-100 text-red-700 ring-red-300",
  neutro: "bg-slate-100 text-slate-700 ring-slate-300",
};

function Selo({ situacao, children }: { situacao: Situacao; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", SELO[situacao])}>
      {children}
    </span>
  );
}

function Cartao({
  icone,
  titulo,
  selo,
  children,
  destaque,
}: {
  icone: React.ReactNode;
  titulo: string;
  selo: React.ReactNode;
  children: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-white p-5",
        destaque ? "border-brand-300 shadow-[0_0_40px_-18px] shadow-brand-600/60" : "border-slate-200",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className="text-slate-500">{icone}</span>
          {titulo}
        </h2>
        {selo}
      </div>
      {children}
    </section>
  );
}

function Valor({ grande, pequeno }: { grande: string; pequeno?: string }) {
  return (
    <p className="tabular leading-none">
      <span className="font-display text-[34px] font-bold tracking-tight text-slate-950">{grande}</span>
      {pequeno && <span className="ml-2 text-sm text-slate-500">{pequeno}</span>}
    </p>
  );
}

/** Situação dos juros da competência atual. */
export function situacaoJuros(c: CoberturaEmprestimo | null): { situacao: Situacao; texto: string } {
  if (!c) return { situacao: "ok", texto: "Nada a pagar" };
  if (money(c.juros_em_aberto).isZero()) return { situacao: "ok", texto: "Pago" };
  if (c.vencida) return { situacao: "atraso", texto: "Atrasado" };
  return { situacao: "atencao", texto: `Vence ${formatDateBR(c.data_vencimento).slice(0, 5)}` };
}

/**
 * Os três cartões que respondem, sem precisar ler números miúdos:
 * os juros deste mês estão pagos? quanto já guardei? quanto falta para quitar?
 */
export function ResumoEmprestimo({
  e,
  cobertura,
  quitacao,
  editavel,
}: {
  e: EmprestimoPosicao;
  cobertura: CoberturaEmprestimo | null;
  quitacao: QuitacaoSugerida | null;
  editavel: boolean;
}) {
  const principalDevido = money(e.principal_devido);
  const reserva = money(e.reserva_saldo);
  const quitado = principalDevido.isZero();
  const pctReserva = quitado ? 100 : Math.min(100, reserva.dividedBy(e.valor_principal).times(100).toNumber());
  const faltaReserva = principalDevido.minus(reserva);
  const juros = situacaoJuros(cobertura);
  const pctJuros =
    cobertura && !money(cobertura.juros_devido).isZero()
      ? money(cobertura.juros_pago).dividedBy(cobertura.juros_devido).times(100).toNumber()
      : 100;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* 1. Juros deste mês */}
      <Cartao
        icone={<Receipt className="h-4 w-4" />}
        titulo={cobertura ? `Juros de ${mesPorExtenso(cobertura.data_vencimento)}` : "Juros"}
        selo={
          <Selo situacao={juros.situacao}>
            {juros.situacao === "ok" ? <CircleCheck className="h-3.5 w-3.5" /> : juros.situacao === "atraso" ? <AlertTriangle className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
            {juros.texto}
          </Selo>
        }
      >
        {cobertura ? (
          <>
            <Valor grande={formatBRL(cobertura.juros_pago)} pequeno={`de ${formatBRL(cobertura.juros_devido)}`} />
            <ProgressBar value={pctJuros} tone={juros.situacao === "atraso" ? "red" : juros.situacao === "ok" ? "brand" : "juros"} className="h-3" />
            {cobertura.fontes.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {cobertura.fontes.map((f, i) => (
                  <li key={f.operacao_id ?? i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                    {f.processo_codigo ?? "Pagamento direto"} <span className="tabular font-semibold text-slate-950">{formatBRL(f.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Ainda não chegou nada para este mês.</p>
            )}
          </>
        ) : (
          <Valor grande="R$ 0,00" pequeno="sem juros em aberto" />
        )}
      </Cartao>

      {/* 2. Reserva */}
      <Cartao
        icone={<PiggyBank className="h-4 w-4" />}
        titulo="Reserva guardada"
        selo={<Selo situacao={pctReserva >= 100 ? "ok" : "neutro"}>{pctReserva.toFixed(0)}% do empréstimo</Selo>}
      >
        <Valor grande={formatBRL(reserva)} pequeno={`de ${formatBRL(e.valor_principal)}`} />
        <ProgressBar value={pctReserva} tone="green" className="h-3" />
        <p className="text-sm text-slate-500">Dinheiro separado para devolver o valor emprestado.</p>
      </Cartao>

      {/* 3. Quitação */}
      <Cartao
        icone={<Trophy className="h-4 w-4" />}
        titulo="Para quitar"
        destaque={!!quitacao?.reserva_cobre_principal}
        selo={
          quitado ? (
            <Selo situacao="ok">
              <BadgeCheck className="h-3.5 w-3.5" /> Quitado
            </Selo>
          ) : quitacao?.reserva_cobre_principal ? (
            <Selo situacao="ok">Pronto</Selo>
          ) : (
            <Selo situacao={e.data_vencimento_principal < hojeISO() ? "atraso" : "neutro"}>
              Vence {formatDateBR(e.data_vencimento_principal)}
            </Selo>
          )
        }
      >
        {quitado ? (
          <>
            <Valor grande="R$ 0,00" pequeno="nada a devolver" />
            <p className="text-sm text-slate-500">Principal quitado em {formatDateBR(e.data_quitacao_principal)}.</p>
          </>
        ) : quitacao?.reserva_cobre_principal ? (
          <>
            <Valor grande={formatBRL(principalDevido)} pequeno="já cobertos pela reserva" />
            {editavel ? (
              <QuitarReservaButton
                emprestimoId={e.id}
                principalDevido={quitacao.principal_devido}
                reservaSaldo={quitacao.reserva_saldo}
                dataSugerida={quitacao.data_sugerida}
              />
            ) : (
              <p className="text-sm text-slate-500">Um operador pode quitar com a reserva.</p>
            )}
          </>
        ) : (
          <>
            <Valor grande={formatBRL(faltaReserva)} pequeno="faltam na reserva" />
            <p className="text-sm text-slate-500">
              Devolver {formatBRL(principalDevido)} ao credor{" "}
              <Link href={`/emprestimos/${e.id}?aba=cronograma`} className="text-brand-700 hover:underline">
                ver cronograma
              </Link>
            </p>
          </>
        )}
      </Cartao>
    </div>
  );
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function mesPorExtenso(iso: string) {
  return MESES[Number(iso.slice(5, 7)) - 1] ?? "";
}
