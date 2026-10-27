import { describe, expect, it } from "vitest";
import { gerarCronograma, jurosContratadosReferencia, jurosMensal, percentualParaFracao } from "./juros";

describe("juros fixos sobre o principal", () => {
  it("R$ 1.000 a 10% gera R$ 100 por mês", () => {
    expect(jurosMensal(1000, 0.1).toFixed(2)).toBe("100.00");
  });

  it("arredonda para centavos meio para cima", () => {
    // 333,33 * 1,5% = 4,99995 -> 5,00
    expect(jurosMensal("333.33", "0.015").toFixed(2)).toBe("5.00");
  });

  it("não usa ponto flutuante binário", () => {
    // 0,1 + 0,2 em float = 0,30000000000000004
    expect(jurosMensal("0.3", 1).toFixed(2)).toBe("0.30");
    expect(jurosMensal("1234567.89", "0.0275").toFixed(2)).toBe("33950.62");
  });

  it("referência de juros contratados = juros mensal x prazo", () => {
    expect(jurosContratadosReferencia(1000, 0.1, 12).toFixed(2)).toBe("1200.00");
  });

  it("percentual digitado vira fração", () => {
    expect(percentualParaFracao("2.5").toString()).toBe("0.025");
  });
});

describe("cronograma", () => {
  const c = gerarCronograma({
    valorPrincipal: 1000,
    taxaJurosMensal: 0.1,
    dataInicio: "2026-01-31",
    prazoMeses: 3,
    pagamentoMensalPlanejado: 100,
    reservaMensalPlanejada: 50,
  });

  it("gera uma competência por mês com juros fixos", () => {
    expect(c).toHaveLength(3);
    expect(c.every((x) => x.jurosDevido.toFixed(2) === "100.00")).toBe(true);
  });

  it("ajusta fim de mês como o PostgreSQL", () => {
    expect(c.map((x) => x.dataVencimento)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("principal previsto apenas na última competência", () => {
    expect(c.map((x) => x.principalPrevisto.toFixed(2))).toEqual(["0.00", "0.00", "1000.00"]);
  });
});
