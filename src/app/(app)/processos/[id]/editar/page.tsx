import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ProcessoForm } from "@/modules/processos/components/processo-form";
import type { Processo, ProcessoParte } from "@/types/db";

export const metadata: Metadata = { title: "Editar processo" };

export default async function EditarProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!podeEditar(await getPerfil())) redirect(`/processos/${id}`);
  const supabase = await createClient();
  const [{ data: processo }, { data: partes }] = await Promise.all([
    supabase.from("processos").select("*").eq("id", id).is("excluido_em", null).maybeSingle(),
    supabase.from("processo_partes").select("*").eq("processo_id", id).order("polo").order("nome"),
  ]);
  if (!processo) notFound();
  const p = processo as Processo;

  return (
    <>
      <PageHeader title={`Editar ${p.codigo}`} back={{ href: `/processos/${id}`, label: p.codigo }} />
      <Card className="max-w-5xl">
        <CardBody>
          <ProcessoForm processo={p} partes={(partes ?? []) as ProcessoParte[]} />
        </CardBody>
      </Card>
    </>
  );
}
