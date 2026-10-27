import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Simulador, type EmprestimoBase } from "@/modules/simulador/components/simulador";

export const metadata: Metadata = { title: "Simulador" };

export default async function SimuladorPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vw_emprestimo_posicao")
    .select(
      "id, codigo, credor_nome, valor_principal, taxa_juros_mensal, principal_devido, juros_vencidos_nao_pagos, reserva_saldo, valor_mensal_pagamento_planejado, valor_mensal_reserva_planejado",
    )
    .eq("status", "ativo")
    .order("codigo");

  return (
    <>
      <PageHeader title="Simulador de projeções" description="Compare cenários de pagamento e reserva sem alterar os registros reais." />
      <Simulador emprestimos={(data ?? []) as EmprestimoBase[]} />
    </>
  );
}
