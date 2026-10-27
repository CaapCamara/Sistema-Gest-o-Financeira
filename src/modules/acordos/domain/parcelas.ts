import Decimal from "decimal.js";
import { addDays } from "date-fns";
import { money, round2, sum, type MoneyInput } from "@/lib/money";
import { addMonthsISO, parseDateOnly, toISODate } from "@/lib/dates";
import type { SituacaoParcela } from "@/types/db";

/**
 * Regras confirmadas (espelham supabase/migrations/..._modulo_acordos.sql):
 *  - Parcelas iguais com a diferença de centavos na última, ou digitadas uma a uma.
 *  - Carência (padrão 3 dias corridos): atrasada quando hoje > vencimento + carência.
 *  - Recebimento parcial permitido; o excedente abate as parcelas seguintes.
 */

export const CARENCIA_PADRAO = 3;

export interface ParcelaPrevista {
  numero: number;
  valor: Decimal;
  dataVencimento: string;
}

/** Divide o total em parcelas iguais (truncadas no centavo); a última recebe a diferença. */
export function gerarParcelasIguais(total: MoneyInput, quantidade: number, primeiroVencimento: string): ParcelaPrevista[] {
  const valorTotal = round2(total);
  const base = valorTotal.dividedBy(quantidade).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const ultima = valorTotal.minus(base.times(quantidade - 1));
  return Array.from({ length: quantidade }, (_, i) => ({
    numero: i + 1,
    valor: i === quantidade - 1 ? ultima : base,
    dataVencimento: addMonthsISO(primeiroVencimento, i),
  }));
}

/** Valor do acordo menos a soma das parcelas. Diferente de zero gera apenas aviso. */
export function diferencaParcelas(total: MoneyInput, valores: MoneyInput[]): Decimal {
  return round2(total).minus(sum(valores));
}

export function dataLimite(dataVencimento: string, diasCarencia: number): string {
  return toISODate(addDays(parseDateOnly(dataVencimento), diasCarencia));
}

export function situacaoParcela(p: {
  valor: MoneyInput;
  recebido: MoneyInput;
  dataVencimento: string;
  diasCarencia: number;
  hoje: string;
}): SituacaoParcela {
  const recebido = money(p.recebido);
  if (recebido.greaterThanOrEqualTo(money(p.valor))) return "recebida";
  if (p.hoje <= p.dataVencimento) return recebido.greaterThan(0) ? "parcial" : "a_vencer";
  if (p.hoje <= dataLimite(p.dataVencimento, p.diasCarencia)) return "em_carencia";
  return recebido.greaterThan(0) ? "parcial_atrasada" : "atrasada";
}

export interface ParcelaEmAberto {
  id: string;
  numero: number;
  dataVencimento: string;
  saldo: MoneyInput;
}

export interface Imputacao {
  parcelaId: string;
  numero: number;
  valor: Decimal;
}

/**
 * Distribui um recebimento entre as parcelas em aberto (prévia; o banco aplica a mesma regra).
 * Com parcela indicada: ela primeiro, depois as seguintes e, por fim, as anteriores.
 * Sem parcela indicada: da mais antiga para a mais recente.
 * Retorna null se o valor exceder o saldo em aberto.
 */
export function distribuirRecebimento(
  parcelas: ParcelaEmAberto[],
  valor: MoneyInput,
  parcelaIndicadaId?: string | null,
): Imputacao[] | null {
  const abertas = parcelas.filter((p) => money(p.saldo).greaterThan(0));
  const total = sum(abertas.map((p) => p.saldo));
  let restante = round2(valor);
  if (restante.lessThanOrEqualTo(0) || restante.greaterThan(total)) return null;

  const chave = (p: ParcelaEmAberto) => `${p.dataVencimento}#${String(p.numero).padStart(4, "0")}`;
  const indicada = abertas.find((p) => p.id === parcelaIndicadaId) ?? parcelas.find((p) => p.id === parcelaIndicadaId);
  const grupo = (p: ParcelaEmAberto) => {
    if (!indicada) return 0;
    if (p.id === indicada.id) return 0;
    return chave(p) > chave(indicada) ? 1 : 2;
  };
  const ordenadas = [...abertas].sort((a, b) => grupo(a) - grupo(b) || chave(a).localeCompare(chave(b)));

  const resultado: Imputacao[] = [];
  for (const p of ordenadas) {
    if (restante.lessThanOrEqualTo(0)) break;
    const aplicar = Decimal.min(restante, money(p.saldo));
    resultado.push({ parcelaId: p.id, numero: p.numero, valor: aplicar });
    restante = restante.minus(aplicar);
  }
  return resultado;
}
