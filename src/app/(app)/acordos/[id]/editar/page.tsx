import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { AcordoForm } from "@/modules/acordos/components/acordo-form";
import type { Acordo } from "@/types/db";

export const metadata: Metadata = { title: "Editar acordo" };

export default async function EditarAcordoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!podeEditar(await getPerfil())) redirect(`/acordos/${id}`);
  const supabase = await createClient();
  const [{ data: acordo }, { data: parcelas }, { data: processos }, { count }] = await Promise.all([
    supabase.from("acordos").select("*").eq("id", id).is("excluido_em", null).maybeSingle(),
    supabase.from("acordo_parcelas").select("valor, data_vencimento").eq("acordo_id", id).order("numero"),
    supabase.from("processos").select("id, codigo, numero_processo").is("excluido_em", null),
    supabase.from("acordo_recebimentos").select("id", { count: "exact", head: true }).eq("acordo_id", id).is("estornado_em", null),
  ]);
  if (!acordo) notFound();
  const a = acordo as Acordo;

  return (
    <>
      <PageHeader title={`Editar ${a.codigo}`} back={{ href: `/acordos/${id}`, label: a.codigo }} />
      <Card className="max-w-5xl">
        <CardBody>
          <AcordoForm processos={processos ?? []} acordo={a} parcelas={parcelas ?? []} possuiRecebimentos={(count ?? 0) > 0} />
        </CardBody>
      </Card>
    </>
  );
}
