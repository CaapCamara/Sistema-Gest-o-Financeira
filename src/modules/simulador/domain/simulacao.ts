import Decimal from "decimal.js";
import { money, round2, type MoneyInput } from "@/lib/money";
import { jurosMensal } from "@/modules/emprestimos/domain/juros";

/**
 * Simulação de projeções — NÃO grava nada no banco.
 * Aplica as mesmas regras confirmadas do módulo de empréstimos:
 *  - juros fixos mensais sobre o principal original (sem capitalização);
 *  - juros não pagos acumulam sem gerar novos juros;
 *  - pagamento abate primeiro juros em aberto, depois principal;
 *  - reserva é acumulada à parte e não abate a dívida;
 *  - quitado o principal, os juros seguintes deixam de ser devidos;
 *  - sem multa, mora ou correção monetária.
 */
export interface CenarioInput {
  nome: string;
  principalOriginal: MoneyInput; // base de cálculo dos juros
  principalDevidoInicial?: MoneyInput; // padrão: principal original
  jurosEmAbertoInicial?: MoneyInput; // juros vencidos não pagos no ponto de partida
  reservaInicial?: MoneyInput;
  taxaMensal: MoneyInput; // fração (0.1 = 10%)
  meses: number;
  pagamentoMensal: MoneyInput;
  reservaMensal: MoneyInput;
}

export interface MesSimulado {
  mes: number;
  jurosDoMes: Decimal;
  pagamento: Decimal;
  pagoJuros: Decimal;
  pagoPrincipal: Decimal;
  jurosEmAberto: Decimal;
  principalDevido: Decimal;
  reservaAcumulada: Decimal;
  saldoExigivel: Decimal;
}

export interface ResultadoCenario {
  nome: string;
  meses: number;
  jurosMensal: Decimal;
  totalJurosDevidos: Decimal;
  totalPago: Decimal;
  totalPagoJuros: Decimal;
  totalPagoPrincipal: Decimal;
  jurosEmAbertoFinal: Decimal;
  principalDevidoFinal: Decimal;
  reservaFinal: Decimal;
  saldoExigivelFinal: Decimal;
  /** Saldo exigível menos reserva acumulada (negativo = reserva cobre a dívida e sobra). */
  saldoLiquidoAposReserva: Decimal;
  quitadoNoMes: number | null;
  meses_detalhe: MesSimulado[];
}

export function simularCenario(c: CenarioInput): ResultadoCenario {
  const juros = jurosMensal(c.principalOriginal, c.taxaMensal);
  let principal = round2(c.principalDevidoInicial ?? c.principalOriginal);
  let jurosAberto = round2(c.jurosEmAbertoInicial ?? 0);
  let reserva = round2(c.reservaInicial ?? 0);
  const pagamentoMensal = round2(c.pagamentoMensal);
  const reservaMensal = round2(c.reservaMensal);

  let totalJuros = new Decimal(0);
  let totalPago = new Decimal(0);
  let totalPagoJuros = new Decimal(0);
  let totalPagoPrincipal = new Decimal(0);
  let quitadoNoMes: number | null = null;
  const detalhe: MesSimulado[] = [];

  for (let mes = 1; mes <= c.meses; mes++) {
    // Quitado o principal, os juros seguintes deixam de ser devidos (regra confirmada)
    const jurosDoMes = principal.greaterThan(0) ? juros : new Decimal(0);
    jurosAberto = jurosAberto.plus(jurosDoMes);
    totalJuros = totalJuros.plus(jurosDoMes);

    const devidoTotal = jurosAberto.plus(principal);
    const pagamento = Decimal.min(pagamentoMensal, devidoTotal);
    const pagoJuros = Decimal.min(pagamento, jurosAberto);
    const pagoPrincipal = Decimal.min(pagamento.minus(pagoJuros), principal);

    jurosAberto = jurosAberto.minus(pagoJuros);
    principal = principal.minus(pagoPrincipal);
    reserva = reserva.plus(reservaMensal);

    totalPago = totalPago.plus(pagamento);
    totalPagoJuros = totalPagoJuros.plus(pagoJuros);
    totalPagoPrincipal = totalPagoPrincipal.plus(pagoPrincipal);

    if (quitadoNoMes === null && principal.isZero() && jurosAberto.isZero()) quitadoNoMes = mes;

    detalhe.push({
      mes,
      jurosDoMes,
      pagamento,
      pagoJuros,
      pagoPrincipal,
      jurosEmAberto: jurosAberto,
      principalDevido: principal,
      reservaAcumulada: reserva,
      saldoExigivel: principal.plus(jurosAberto),
    });
  }

  const saldo = principal.plus(jurosAberto);
  return {
    nome: c.nome,
    meses: c.meses,
    jurosMensal: juros,
    totalJurosDevidos: totalJuros,
    totalPago,
    totalPagoJuros,
    totalPagoPrincipal,
    jurosEmAbertoFinal: jurosAberto,
    principalDevidoFinal: principal,
    reservaFinal: reserva,
    saldoExigivelFinal: saldo,
    saldoLiquidoAposReserva: saldo.minus(reserva),
    quitadoNoMes,
    meses_detalhe: detalhe,
  };
}

/** Multiplicador simples: valor × cada quantidade de meses. */
export function multiplicar(valor: MoneyInput, quantidades: number[]): { meses: number; total: Decimal }[] {
  const v = money(valor);
  return quantidades.map((meses) => ({ meses, total: round2(v.times(meses)) }));
}
