import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_DOCUMENTOS } from "@/modules/documentos/regras";

/**
 * Download de documento: confere o acesso (RLS) e redireciona para uma URL assinada
 * válida por 60 segundos. O bucket é privado; não há link público permanente.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Documento não encontrado.", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Não autenticado.", { status: 401 });

  const { data: doc } = await supabase
    .from("documentos")
    .select("storage_path, nome_arquivo")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Documento não encontrado.", { status: 404 });

  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(doc.storage_path, 60, { download: doc.nome_arquivo });
  if (error || !data) return new NextResponse("Não foi possível gerar o link do arquivo.", { status: 500 });

  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
