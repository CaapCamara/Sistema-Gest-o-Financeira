import { describe, expect, it } from "vitest";
import { coberturaPrevista, cotasDaParcela } from "./destinacao";

describe("cotasDaParcela", () => {
  it("divide 50/50 a parcela de R$ 2.000", () => {
    const c = cotasDaParcela(2000, 50, 50);
    expect(c.emprestimo.toFixed(2)).toBe("1000.00");
    expect(c.reserva.toFixed(2)).toBe("1000.00");
    expect(c.livre.toFixed(2)).toBe("0.00");
  });

  it("com soma de 100%, a reserva fica com a diferença exata do arredondamento", () => {
    const c = cotasDaParcela("333.33", 50, 50);
    expect(c.emprestimo.toFixed(2)).toBe("166.67");
    expect(c.reserva.toFixed(2)).toBe("166.66");
    expect(c.emprestimo.plus(c.reserva).toFixed(2)).toBe("333.33");
  });

  it("percentual abaixo de 100% deixa a diferença livre (remanescente)", () => {
    const c = cotasDaParcela(1000, 40, 0);
    expect(c.emprestimo.toFixed(2)).toBe("400.00");
    expect(c.reserva.toFixed(2)).toBe("0.00");
    expect(c.livre.toFixed(2)).toBe("600.00");
  });
});

describe("coberturaPrevista", () => {
  it("soma contribuições de vários processos", () => {
    const r = coberturaPrevista(1000, [600, 400]);
    expect(r.total.toFixed(2)).toBe("1000.00");
    expect(r.diferenca.toFixed(2)).toBe("0.00");
  });

  it("indica falta quando as contribuições não cobrem os juros", () => {
    expect(coberturaPrevista(1000, [600]).diferenca.toFixed(2)).toBe("-400.00");
  });
});
