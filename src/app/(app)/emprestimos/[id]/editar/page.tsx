import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmprestimoForm } from "@/modules/emprestimos/components/emprestimo-form";
import type { Emprestimo } from "@/types/db";

export const metadata: Metadata = { title: "Editar empréstimo" };

export default async function EditarEmprestimoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!podeEditar(await getPerfil())) redirect(`/emprestimos/${id}`);
  const supabase = await createClient();
  const [{ data: emprestimo }, { data: credores }, { count }] = await Promise.all([
    supabase.from("emprestimos").select("*").eq("id", id).is("excluido_em", null).maybeSingle(),
    supabase.from("credores").select("id, nome").is("excluido_em", null).order("nome"),
    supabase.from("pagamentos").select("id", { count: "exact", head: true }).eq("emprestimo_id", id).is("estornado_em", null),
  ]);
  if (!emprestimo) notFound();
  const e = emprestimo as Emprestimo;

  return (
    <>
      <PageHeader title={`Editar ${e.codigo}`} back={{ href: `/emprestimos/${id}`, label: e.codigo }} />
      <Card className="max-w-5xl">
        <CardBody>
          <EmprestimoForm credores={credores ?? []} emprestimo={e} possuiPagamentos={(count ?? 0) > 0} />
        </CardBody>
      </Card>
    </>
  );
}
