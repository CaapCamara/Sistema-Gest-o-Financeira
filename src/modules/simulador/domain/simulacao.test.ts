import { describe, expect, it } from "vitest";
import { multiplicar, simularCenario } from "./simulacao";

const base = { nome: "A", principalOriginal: 1000, taxaMensal: 0.1, reservaMensal: 50 };

describe("simulador", () => {
  it("paga só os juros: principal não muda e nada acumula", () => {
    const r = simularCenario({ ...base, meses: 12, pagamentoMensal: 100 });
    expect(r.totalJurosDevidos.toFixed(2)).toBe("1200.00");
    expect(r.totalPagoJuros.toFixed(2)).toBe("1200.00");
    expect(r.principalDevidoFinal.toFixed(2)).toBe("1000.00");
    expect(r.jurosEmAbertoFinal.toFixed(2)).toBe("0.00");
    expect(r.reservaFinal.toFixed(2)).toBe("600.00");
  });

  it("pagamento menor que os juros: acumula sem juros sobre juros", () => {
    const r = simularCenario({ ...base, meses: 6, pagamentoMensal: 60 });
    // 6 x 100 devidos - 6 x 60 pagos = 240 em aberto, principal intacto
    expect(r.jurosEmAbertoFinal.toFixed(2)).toBe("240.00");
    expect(r.principalDevidoFinal.toFixed(2)).toBe("1000.00");
    expect(r.saldoExigivelFinal.toFixed(2)).toBe("1240.00");
  });

  it("pagamento maior: excedente abate principal e juros continuam fixos", () => {
    const r = simularCenario({ ...base, meses: 2, pagamentoMensal: 300, reservaMensal: 0 });
    // mês 1: 100 juros + 200 principal; mês 2: juros continuam 100 (base original) + 200 principal
    expect(r.meses_detalhe[1].jurosDoMes.toFixed(2)).toBe("100.00");
    expect(r.principalDevidoFinal.toFixed(2)).toBe("600.00");
  });

  it("reserva não reduz a dívida", () => {
    const r = simularCenario({ ...base, meses: 3, pagamentoMensal: 0, reservaMensal: 500 });
    expect(r.saldoExigivelFinal.toFixed(2)).toBe("1300.00");
    expect(r.reservaFinal.toFixed(2)).toBe("1500.00");
    expect(r.saldoLiquidoAposReserva.toFixed(2)).toBe("-200.00");
  });

  it("detecta o mês de quitação", () => {
    const r = simularCenario({ ...base, meses: 12, pagamentoMensal: 600, reservaMensal: 0 });
    expect(r.quitadoNoMes).toBe(2);
    expect(r.totalPago.toFixed(2)).toBe("1200.00");
  });

  it("multiplica valores por quantidades de meses", () => {
    expect(multiplicar("150,00".replace(",", "."), [3, 6, 12]).map((x) => x.total.toFixed(2))).toEqual([
      "450.00",
      "900.00",
      "1800.00",
    ]);
  });
});
