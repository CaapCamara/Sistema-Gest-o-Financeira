"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { formatBRL, money, parseDecimalBR } from "@/lib/money";
import { coberturaPrevista, cotasDaParcela } from "../domain/destinacao";
import { criarOperacao } from "../actions/operacoes";

export interface EmprestimoOpcao {
  id: string;
  codigo: string;
  credor_nome: string;
  juros_mensal: number | string;
  /** Contribuições mensais já previstas por outras operações ativas */
  contribuicoes_atuais: (number | string)[];
}

export function OperacaoDialog({
  acordoId,
  acordoCodigo,
  valorParcelaReferencia,
  emprestimos,
}: {
  acordoId: string;
  acordoCodigo: string;
  valorParcelaReferencia: number | string | null;
  emprestimos: EmprestimoOpcao[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emprestimoId, setEmprestimoId] = useState(emprestimos[0]?.id ?? "");
  const [pctEmprestimo, setPctEmprestimo] = useState("50");
  const [pctReserva, setPctReserva] = useState("50");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string | undefined>>({});
  const [pending, startTransition] = useTransition();

  const emprestimo = emprestimos.find((e) => e.id === emprestimoId);
  const pe = parseDecimalBR(pctEmprestimo || "0");
  const pr = parseDecimalBR(pctReserva || "0");
  const somaValida = pe !== null && pr !== null && money(pe).plus(pr).lte(100) && money(pe).plus(pr).gt(0);

  const previa = useMemo(() => {
    if (!somaValida || valorParcelaReferencia === null) return null;
    return cotasDaParcela(valorParcelaReferencia, pe!, pr!);
  }, [somaValida, valorParcelaReferencia, pe, pr]);

  const cobertura = useMemo(() => {
    if (!emprestimo || !previa) return null;
    return coberturaPrevista(emprestimo.juros_mensal, [...emprestimo.contribuicoes_atuais, previa.emprestimo.toString()]);
  }, [emprestimo, previa]);

  function salvar() {
    setErro(null);
    setErrosCampo({});
    startTransition(async () => {
      const res = await criarOperacao({
        acordo_id: acordoId,
        emprestimo_id: emprestimoId,
        percentual_emprestimo: pctEmprestimo,
        percentual_reserva: pctReserva,
        observacoes,
      });
      if (!res.ok) {
        setErro(res.error);
        setErrosCampo(Object.fromEntries(Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={emprestimos.length === 0}>
        <ArrowRightLeft className="h-4 w-4" /> Vincular a empréstimo
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Nova operação · ${acordoCodigo}`}>
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <FormAlert tone="info">
            Cada recebimento deste acordo passa a ser dividido automaticamente: a parte do empréstimo paga os juros em
            aberto (vencidos e a próxima parcela), a parte da reserva vira aporte e o que sobrar vai para o montante
            remanescente.
          </FormAlert>

          <Field label="Empréstimo" htmlFor="op_emprestimo" error={errosCampo.emprestimo_id} required>
            <Select id="op_emprestimo" value={emprestimoId} onChange={(e) => setEmprestimoId(e.target.value)}>
              {emprestimos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.credor_nome} · juros {formatBRL(e.juros_mensal)}/mês
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="% para os juros do empréstimo" htmlFor="op_pe" error={errosCampo.percentual_emprestimo} required>
              <Input id="op_pe" inputMode="decimal" value={pctEmprestimo} onChange={(e) => setPctEmprestimo(e.target.value)} />
            </Field>
            <Field label="% para a reserva" htmlFor="op_pr" error={errosCampo.percentual_reserva} required>
              <Input id="op_pr" inputMode="decimal" value={pctReserva} onChange={(e) => setPctReserva(e.target.value)} />
            </Field>
          </div>

          {!somaValida && <p className="text-sm text-red-600">A soma dos percentuais deve ficar entre 0% e 100%.</p>}

          {previa && valorParcelaReferencia !== null && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="mb-2 font-medium text-slate-700">Numa parcela de {formatBRL(valorParcelaReferencia)}</p>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white p-2 ring-1 ring-brand-100">
                  <dt className="text-xs text-slate-500">Juros</dt>
                  <dd className="tabular font-semibold text-brand-700">{formatBRL(previa.emprestimo)}</dd>
                </div>
                <div className="rounded-lg bg-white p-2 ring-1 ring-emerald-100">
                  <dt className="text-xs text-slate-500">Reserva</dt>
                  <dd className="tabular font-semibold text-emerald-700">{formatBRL(previa.reserva)}</dd>
                </div>
                <div className="rounded-lg bg-white p-2 ring-1 ring-violet-100">
                  <dt className="text-xs text-slate-500">Remanescente</dt>
                  <dd className="tabular font-semibold text-violet-700">{formatBRL(previa.livre)}</dd>
                </div>
              </dl>
            </div>
          )}

          {cobertura && (
            <FormAlert tone={cobertura.diferenca.isZero() ? "success" : "info"}>
              Somando as operações ativas deste empréstimo, a contribuição prevista para os juros fica em{" "}
              <strong>{formatBRL(cobertura.total)}</strong> por mês, para juros de {formatBRL(cobertura.juros)}.{" "}
              {cobertura.diferenca.isNegative()
                ? `Faltam ${formatBRL(cobertura.diferenca.abs())} por mês, que precisarão de outra fonte.`
                : cobertura.diferenca.isPositive()
                  ? `Sobram ${formatBRL(cobertura.diferenca)} por mês, que vão para o montante remanescente.`
                  : "A parcela de juros fica exatamente coberta."}
            </FormAlert>
          )}

          <Field label="Observações" htmlFor="op_obs">
            <Textarea id="op_obs" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </Field>

          <p className="text-xs text-slate-500">
            Os percentuais não podem ser alterados depois. Para mudar a regra, encerre a operação e crie outra. Recebimentos
            já registrados não são redistribuídos.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !somaValida || !emprestimoId}>
              {pending ? "Criando..." : "Criar operação"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
