import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ProtocoloForm } from "@/modules/protocolos/components/protocolo-form";
import { dadosFormularioProtocolo } from "@/modules/protocolos/queries";
import type { Protocolo } from "@/types/db";

export const metadata: Metadata = { title: "Editar protocolo" };

export default async function EditarProtocoloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!podeEditar(await getPerfil())) redirect(`/protocolos/${id}`);
  const supabase = await createClient();
  const [{ data: protocolo }, { data: vinculos }, dados] = await Promise.all([
    supabase.from("protocolos").select("*").eq("id", id).is("excluido_em", null).maybeSingle(),
    supabase.from("protocolo_processos").select("processo_id").eq("protocolo_id", id),
    dadosFormularioProtocolo(supabase),
  ]);
  if (!protocolo) notFound();
  const p = protocolo as Protocolo;

  return (
    <>
      <PageHeader title={`Editar ${p.codigo}`} back={{ href: `/protocolos/${id}`, label: p.codigo }} />
      <Card className="max-w-5xl">
        <CardBody>
          <ProtocoloForm protocolo={p} processoIds={(vinculos ?? []).map((v) => v.processo_id as string)} {...dados} />
        </CardBody>
      </Card>
    </>
  );
}
