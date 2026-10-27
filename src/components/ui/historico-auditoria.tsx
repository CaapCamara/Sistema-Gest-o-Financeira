import { formatDateTimeBR } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import type { RegistroAuditoria } from "@/types/db";

const IGNORAR = new Set(["atualizado_em", "criado_em", "criado_por", "id"]);

export function resumoAlteracao(a: RegistroAuditoria): string {
  if (a.acao === "INSERT") return "Registro criado";
  if (a.acao === "DELETE") return "Registro removido";
  const antes = a.dados_antes ?? {};
  const depois = a.dados_depois ?? {};
  const campos = Object.keys(depois).filter(
    (k) => !IGNORAR.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k]),
  );
  return campos.map((k) => `${k}: ${String(antes[k] ?? "—")} → ${String(depois[k] ?? "—")}`).join(" · ") || "—";
}

/** Aba "Histórico de alterações" (somente administradores veem os registros). */
export function HistoricoAuditoria({ registros, admin }: { registros: RegistroAuditoria[]; admin: boolean }) {
  return (
    <Card>
      <CardHeader title="Histórico de alterações" description="Registro automático de inclusões, alterações e estornos." />
      {!admin ? (
        <CardBody>
          <p className="text-sm text-slate-500">Disponível apenas para administradores.</p>
        </CardBody>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Registro</Th>
              <Th>Ação</Th>
              <Th>Campos alterados</Th>
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 && <EmptyRow colSpan={4}>Sem registros.</EmptyRow>}
            {registros.map((a) => (
              <tr key={a.id} className="align-top">
                <Td>{formatDateTimeBR(a.criado_em)}</Td>
                <Td>{a.tabela}</Td>
                <Td>{a.acao}</Td>
                <Td className="whitespace-normal text-xs text-slate-600">{resumoAlteracao(a)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
