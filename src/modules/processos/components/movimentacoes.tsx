"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, CalendarClock, FileText, Handshake, HandCoins, FileCheck2, Scale, StickyNote, type LucideIcon } from "lucide-react";
import { formatDateBR, formatDateTimeBR, hojeISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/form";
import { registrarAnotacao } from "../actions/processos";
import type { Movimentacao, TipoMovimentacao } from "@/types/db";

const ICONE: Record<TipoMovimentacao, LucideIcon> = {
  anotacao: StickyNote,
  processo: Scale,
  acordo: Handshake,
  recebimento: HandCoins,
  protocolo: FileCheck2,
  documento: FileText,
  operacao: ArrowRightLeft,
};

const ROTULO: Record<TipoMovimentacao, string> = {
  anotacao: "Anotação",
  processo: "Processo",
  acordo: "Acordo",
  recebimento: "Recebimento",
  protocolo: "Protocolo",
  documento: "Documento",
  operacao: "Operação",
};

export function Movimentacoes({
  processoId,
  movimentacoes,
  autores,
  editavel,
}: {
  processoId: string;
  movimentacoes: Movimentacao[];
  autores: Record<string, string>;
  editavel: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Movimentações"
        description="Linha do tempo do processo. Os eventos do sistema entram automaticamente; anotações não podem ser editadas depois de gravadas."
      />
      {editavel && <NovaAnotacao processoId={processoId} />}
      <CardBody>
        {movimentacoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Nenhuma movimentação.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {movimentacoes.map((m) => {
              const Icon = ICONE[m.tipo];
              return (
                <li key={m.id} className="relative">
                  <span className="absolute -left-[2.15rem] flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{formatDateBR(m.data_movimentacao)}</span>
                    <span>{ROTULO[m.tipo]}</span>
                    <span>·</span>
                    <span title={formatDateTimeBR(m.criado_em)}>
                      {m.automatica ? "registro automático" : (m.criado_por && autores[m.criado_por]) || "usuário"}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{m.descricao}</p>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function NovaAnotacao({ processoId }: { processoId: string }) {
  const router = useRouter();
  const [data, setData] = useState(hojeISO());
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const res = await registrarAnotacao(processoId, { data_movimentacao: data, descricao });
      if (!res.ok) return setErro(res.fieldErrors?.descricao?.[0] ?? res.error);
      setDescricao("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-b border-slate-100 px-5 py-4">
      {erro && <FormAlert>{erro}</FormAlert>}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Field label="Data" htmlFor="data_anotacao">
          <Input id="data_anotacao" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Nova anotação" htmlFor="descricao_anotacao">
          <Textarea
            id="descricao_anotacao"
            rows={1}
            className="min-h-10"
            placeholder="Ex.: contato com a parte, prazo informado pelo GOV..."
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Field>
        <Button type="button" onClick={salvar} disabled={pending || descricao.trim().length < 3}>
          <CalendarClock className="h-4 w-4" /> {pending ? "Salvando..." : "Registrar"}
        </Button>
      </div>
    </div>
  );
}
