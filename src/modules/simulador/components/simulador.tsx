"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select } from "@/components/ui/form";
import { Table, Th, Td } from "@/components/ui/table";
import { formatBRL, money, parseDecimalBR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { multiplicar, simularCenario, type ResultadoCenario } from "../domain/simulacao";

export interface EmprestimoBase {
  id: string;
  codigo: string;
  credor_nome: string;
  valor_principal: number | string;
  taxa_juros_mensal: number | string;
  principal_devido: number | string;
  juros_vencidos_nao_pagos: number | string;
  reserva_saldo: number | string;
  valor_mensal_pagamento_planejado: number | string;
  valor_mensal_reserva_planejado: number | string;
}

interface CenarioForm {
  nome: string;
  principalOriginal: string;
  principalDevido: string;
  jurosEmAberto: string;
  reservaInicial: string;
  taxaPct: string;
  meses: string;
  pagamentoMensal: string;
  reservaMensal: string;
}

const br = (v: number | string) => money(v).toFixed(2).replace(".", ",");

const VAZIO: CenarioForm = {
  nome: "Cenário A",
  principalOriginal: "1000,00",
  principalDevido: "1000,00",
  jurosEmAberto: "0,00",
  reservaInicial: "0,00",
  taxaPct: "10",
  meses: "12",
  pagamentoMensal: "100,00",
  reservaMensal: "0,00",
};

function toResultado(f: CenarioForm): ResultadoCenario | null {
  const vals = [f.principalOriginal, f.principalDevido, f.jurosEmAberto, f.reservaInicial, f.taxaPct, f.pagamentoMensal, f.reservaMensal].map(
    parseDecimalBR,
  );
  const meses = Number(f.meses);
  if (vals.some((v) => v === null) || !Number.isInteger(meses) || meses < 1 || meses > 600) return null;
  const [po, pd, ja, ri, tx, pm, rm] = vals as string[];
  return simularCenario({
    nome: f.nome,
    principalOriginal: po,
    principalDevidoInicial: pd,
    jurosEmAbertoInicial: ja,
    reservaInicial: ri,
    taxaMensal: money(tx).dividedBy(100),
    meses,
    pagamentoMensal: pm,
    reservaMensal: rm,
  });
}

export function Simulador({ emprestimos }: { emprestimos: EmprestimoBase[] }) {
  const [cenarios, setCenarios] = useState<CenarioForm[]>([VAZIO]);
  const [selecionado, setSelecionado] = useState(0);

  const resultados = useMemo(() => cenarios.map(toResultado), [cenarios]);

  function atualizar(i: number, campo: keyof CenarioForm, valor: string) {
    setCenarios((cs) => cs.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)));
  }

  function carregarEmprestimo(i: number, id: string) {
    const e = emprestimos.find((x) => x.id === id);
    if (!e) return;
    setCenarios((cs) =>
      cs.map((c, idx) =>
        idx === i
          ? {
              ...c,
              nome: `${e.codigo} — ${e.credor_nome}`,
              principalOriginal: br(e.valor_principal),
              principalDevido: br(e.principal_devido),
              jurosEmAberto: br(e.juros_vencidos_nao_pagos),
              reservaInicial: br(e.reserva_saldo),
              taxaPct: money(e.taxa_juros_mensal).times(100).toString().replace(".", ","),
              pagamentoMensal: br(e.valor_mensal_pagamento_planejado),
              reservaMensal: br(e.valor_mensal_reserva_planejado),
            }
          : c,
      ),
    );
  }

  function adicionar(copiarDe?: number) {
    if (cenarios.length >= 4) return;
    const letra = String.fromCharCode(65 + cenarios.length);
    const base = copiarDe !== undefined ? cenarios[copiarDe] : VAZIO;
    setCenarios((cs) => [...cs, { ...base, nome: `Cenário ${letra}` }]);
  }

  function remover(i: number) {
    setCenarios((cs) => cs.filter((_, idx) => idx !== i));
    setSelecionado(0);
  }

  const detalhe = resultados[selecionado];

  return (
    <div className="space-y-6">
      <FormAlert tone="info">
        A simulação é feita apenas na tela e <strong>não altera nenhum registro</strong>. Regras aplicadas: juros fixos
        sobre o principal original, juros não pagos acumulam sem novos juros, pagamento abate juros e depois principal, e
        reserva não reduz a dívida e os juros deixam de correr quando o principal é quitado.
      </FormAlert>

      <div className="grid gap-4 lg:grid-cols-2">
        {cenarios.map((c, i) => (
          <Card key={i}>
            <CardHeader
              title={<Input value={c.nome} onChange={(e) => atualizar(i, "nome", e.target.value)} className="h-8 font-semibold" />}
              actions={
                <>
                  <Button size="sm" variant="ghost" onClick={() => adicionar(i)} disabled={cenarios.length >= 4} title="Duplicar">
                    <Copy className="h-4 w-4" />
                  </Button>
                  {cenarios.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => remover(i)} title="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              }
            />
            <CardBody className="space-y-3">
              {emprestimos.length > 0 && (
                <Field label="Partir de um empréstimo real (opcional)">
                  <Select defaultValue="" onChange={(e) => carregarEmprestimo(i, e.target.value)}>
                    <option value="">— valores livres —</option>
                    {emprestimos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.codigo} — {e.credor_nome}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Principal original (base dos juros)">
                  <Input inputMode="decimal" value={c.principalOriginal} onChange={(e) => atualizar(i, "principalOriginal", e.target.value)} />
                </Field>
                <Field label="Taxa mensal (%)">
                  <Input inputMode="decimal" value={c.taxaPct} onChange={(e) => atualizar(i, "taxaPct", e.target.value)} />
                </Field>
                <Field label="Principal devido no início">
                  <Input inputMode="decimal" value={c.principalDevido} onChange={(e) => atualizar(i, "principalDevido", e.target.value)} />
                </Field>
                <Field label="Juros em aberto no início">
                  <Input inputMode="decimal" value={c.jurosEmAberto} onChange={(e) => atualizar(i, "jurosEmAberto", e.target.value)} />
                </Field>
                <Field label="Pagamento mensal">
                  <Input inputMode="decimal" value={c.pagamentoMensal} onChange={(e) => atualizar(i, "pagamentoMensal", e.target.value)} />
                </Field>
                <Field label="Reserva mensal">
                  <Input inputMode="decimal" value={c.reservaMensal} onChange={(e) => atualizar(i, "reservaMensal", e.target.value)} />
                </Field>
                <Field label="Reserva inicial">
                  <Input inputMode="decimal" value={c.reservaInicial} onChange={(e) => atualizar(i, "reservaInicial", e.target.value)} />
                </Field>
                <Field label="Quantidade de meses">
                  <Input type="number" min={1} max={600} value={c.meses} onChange={(e) => atualizar(i, "meses", e.target.value)} />
                </Field>
              </div>
              {!resultados[i] && <p className="text-xs text-red-600">Preencha todos os campos com valores válidos.</p>}
            </CardBody>
          </Card>
        ))}
      </div>

      {cenarios.length < 4 && (
        <Button variant="secondary" onClick={() => adicionar()}>
          <Plus className="h-4 w-4" /> Adicionar cenário
        </Button>
      )}

      <Card>
        <CardHeader title="Comparação de cenários" description="Resultado ao final da quantidade de meses de cada cenário." />
        <Table>
          <thead>
            <tr>
              <Th>Indicador</Th>
              {cenarios.map((c, i) => (
                <Th key={i} align="right">
                  {c.nome}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Meses", (r) => String(r.meses)],
                ["Juros fixos por mês", (r) => formatBRL(r.jurosMensal)],
                ["Juros devidos no período", (r) => formatBRL(r.totalJurosDevidos)],
                ["Total pago ao credor", (r) => formatBRL(r.totalPago)],
                ["  · abatido em juros", (r) => formatBRL(r.totalPagoJuros)],
                ["  · abatido em principal", (r) => formatBRL(r.totalPagoPrincipal)],
                ["Juros vencidos não pagos (final)", (r) => formatBRL(r.jurosEmAbertoFinal)],
                ["Principal devido (final)", (r) => formatBRL(r.principalDevidoFinal)],
                ["Saldo exigível (final)", (r) => formatBRL(r.saldoExigivelFinal)],
                ["Reserva acumulada (final)", (r) => formatBRL(r.reservaFinal)],
                ["Saldo exigível − reserva", (r) => formatBRL(r.saldoLiquidoAposReserva)],
                ["Quitação", (r) => (r.quitadoNoMes ? `no mês ${r.quitadoNoMes}` : "não quita no período")],
              ] as [string, (r: ResultadoCenario) => string][]
            ).map(([label, fn]) => (
              <tr key={label} className="hover:bg-slate-50">
                <Td className={cn(label.startsWith("  ") && "pl-6 text-slate-500")}>{label.trim()}</Td>
                {resultados.map((r, i) => (
                  <Td key={i} align="right">
                    {r ? fn(r) : "—"}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Evolução mês a mês"
          actions={
            <Select value={selecionado} onChange={(e) => setSelecionado(Number(e.target.value))} className="h-8 w-56">
              {cenarios.map((c, i) => (
                <option key={i} value={i}>
                  {c.nome}
                </option>
              ))}
            </Select>
          }
        />
        <div className="max-h-[480px] overflow-y-auto">
          <Table>
            <thead className="sticky top-0">
              <tr>
                <Th>Mês</Th>
                <Th align="right">Juros do mês</Th>
                <Th align="right">Pagamento</Th>
                <Th align="right">→ Juros</Th>
                <Th align="right">→ Principal</Th>
                <Th align="right">Juros em aberto</Th>
                <Th align="right">Principal devido</Th>
                <Th align="right">Reserva</Th>
                <Th align="right">Saldo exigível</Th>
              </tr>
            </thead>
            <tbody>
              {detalhe?.meses_detalhe.map((m) => (
                <tr key={m.mes} className="hover:bg-slate-50">
                  <Td>{m.mes}</Td>
                  <Td align="right">{formatBRL(m.jurosDoMes)}</Td>
                  <Td align="right">{formatBRL(m.pagamento)}</Td>
                  <Td align="right">{formatBRL(m.pagoJuros)}</Td>
                  <Td align="right">{formatBRL(m.pagoPrincipal)}</Td>
                  <Td align="right" className={m.jurosEmAberto.greaterThan(0) ? "text-red-700" : ""}>
                    {formatBRL(m.jurosEmAberto)}
                  </Td>
                  <Td align="right">{formatBRL(m.principalDevido)}</Td>
                  <Td align="right" className="text-emerald-700">{formatBRL(m.reservaAcumulada)}</Td>
                  <Td align="right" className="font-medium">{formatBRL(m.saldoExigivel)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Multiplicador />
    </div>
  );
}

function Multiplicador() {
  const [valor, setValor] = useState("100,00");
  const [qtds, setQtds] = useState("1, 3, 6, 12, 18, 24, 36");
  const v = parseDecimalBR(valor);
  const lista = qtds
    .split(/[,;\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 600);
  const linhas = v ? multiplicar(v, lista) : [];

  return (
    <Card>
      <CardHeader title="Multiplicador rápido" description="Multiplica um valor mensal por diferentes quantidades de meses." />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor mensal (R$)">
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <Field label="Quantidades de meses (separadas por vírgula)">
            <Input value={qtds} onChange={(e) => setQtds(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {linhas.map((l) => (
            <div key={l.meses} className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-xs text-slate-500">{l.meses} {l.meses === 1 ? "mês" : "meses"}</p>
              <p className="tabular font-semibold">{formatBRL(l.total)}</p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
