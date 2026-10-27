import { describe, expect, it } from "vitest";
import { diferencaParcelas, distribuirRecebimento, gerarParcelasIguais, situacaoParcela } from "./parcelas";

describe("parcelas iguais", () => {
  it("diferença de centavos fica na última", () => {
    const p = gerarParcelasIguais(1000, 3, "2026-11-10");
    expect(p.map((x) => x.valor.toFixed(2))).toEqual(["333.33", "333.33", "333.34"]);
    expect(diferencaParcelas(1000, p.map((x) => x.valor)).toFixed(2)).toBe("0.00");
  });

  it("vencimentos mensais a partir do primeiro, ajustando fim de mês", () => {
    const p = gerarParcelasIguais(300, 3, "2026-01-31");
    expect(p.map((x) => x.dataVencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("valor exato não gera diferença", () => {
    expect(gerarParcelasIguais("1200", 12, "2026-01-05").every((x) => x.valor.toFixed(2) === "100.00")).toBe(true);
  });
});

describe("situação da parcela com carência", () => {
  const base = { valor: 100, recebido: 0, dataVencimento: "2026-10-10", diasCarencia: 3 };
  it("a vencer até o dia do vencimento", () => {
    expect(situacaoParcela({ ...base, hoje: "2026-10-10" })).toBe("a_vencer");
  });
  it("em carência até vencimento + 3 dias", () => {
    expect(situacaoParcela({ ...base, hoje: "2026-10-11" })).toBe("em_carencia");
    expect(situacaoParcela({ ...base, hoje: "2026-10-13" })).toBe("em_carencia");
  });
  it("atrasada no dia seguinte ao fim da carência", () => {
    expect(situacaoParcela({ ...base, hoje: "2026-10-14" })).toBe("atrasada");
    expect(situacaoParcela({ ...base, recebido: 40, hoje: "2026-10-14" })).toBe("parcial_atrasada");
  });
  it("recebida ignora datas", () => {
    expect(situacaoParcela({ ...base, recebido: 100, hoje: "2027-01-01" })).toBe("recebida");
  });
});

describe("distribuição do recebimento", () => {
  const parcelas = [
    { id: "a", numero: 1, dataVencimento: "2026-10-01", saldo: 100 },
    { id: "b", numero: 2, dataVencimento: "2026-11-01", saldo: 100 },
    { id: "c", numero: 3, dataVencimento: "2026-12-01", saldo: 100 },
  ];
  const fmt = (r: ReturnType<typeof distribuirRecebimento>) => r?.map((i) => `${i.numero}:${i.valor.toFixed(2)}`);

  it("sem parcela indicada abate da mais antiga", () => {
    expect(fmt(distribuirRecebimento(parcelas, 150))).toEqual(["1:100.00", "2:50.00"]);
  });
  it("excedente da indicada vai para as seguintes e depois para as anteriores", () => {
    expect(fmt(distribuirRecebimento(parcelas, 250, "b"))).toEqual(["2:100.00", "3:100.00", "1:50.00"]);
  });
  it("recusa valor acima do saldo", () => {
    expect(distribuirRecebimento(parcelas, 300.01)).toBeNull();
  });
});
