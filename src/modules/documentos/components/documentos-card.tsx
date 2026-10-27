"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeBR } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { prepararEnvio, registrarDocumento, removerDocumento, type Destino } from "../actions/documentos";
import {
  ACCEPT_INPUT,
  BUCKET_DOCUMENTOS,
  formatTamanho,
  TAMANHO_MAXIMO,
  TIPO_DOCUMENTO_LABEL,
  TIPOS_DOCUMENTO,
  TIPOS_MIME_PERMITIDOS,
} from "../regras";
import type { Documento, TipoDocumento } from "@/types/db";

export interface DocumentoListado extends Documento {
  /** Quando o documento vem de um protocolo vinculado ao processo. */
  origem?: { href: string; label: string };
}

export function DocumentosCard({
  destino,
  documentos,
  editavel,
  tipoPadrao = "complementar",
  descricao,
}: {
  destino: Destino;
  documentos: DocumentoListado[];
  editavel: boolean;
  tipoPadrao?: TipoDocumento;
  descricao?: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Documentos"
        description={descricao ?? "Arquivos guardados em armazenamento privado. O download usa um link temporário."}
        actions={editavel && <EnviarDocumento destino={destino} tipoPadrao={tipoPadrao} />}
      />
      <Table>
        <thead>
          <tr>
            <Th>Tipo</Th>
            <Th>Arquivo</Th>
            <Th>Descrição</Th>
            <Th align="right">Tamanho</Th>
            <Th>Enviado em</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {documentos.length === 0 && <EmptyRow colSpan={6}>Nenhum documento anexado.</EmptyRow>}
          {documentos.map((d) => (
            <tr key={d.id} className="align-top hover:bg-slate-50">
              <Td>
                <Badge tone={d.tipo === "complementar" ? "gray" : "blue"}>{TIPO_DOCUMENTO_LABEL[d.tipo]}</Badge>
              </Td>
              <Td className="max-w-xs whitespace-normal break-all">
                <a href={`/documentos/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                  <Download className="h-3.5 w-3.5 shrink-0" /> {d.nome_arquivo}
                </a>
                {d.origem && (
                  <span className="block text-xs text-slate-500">
                    via{" "}
                    <Link href={d.origem.href} className="hover:underline">
                      {d.origem.label}
                    </Link>
                  </span>
                )}
              </Td>
              <Td className="max-w-xs whitespace-normal text-xs text-slate-600">{d.descricao ?? "—"}</Td>
              <Td align="right">{formatTamanho(d.tamanho_bytes)}</Td>
              <Td>{formatDateTimeBR(d.criado_em)}</Td>
              <Td>{editavel && !d.origem && <RemoverDocumento destino={destino} documento={d} />}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function EnviarDocumento({ destino, tipoPadrao }: { destino: Destino; tipoPadrao: TipoDocumento }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoDocumento>(tipoPadrao);
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function escolher(file: File | null) {
    setErro(null);
    if (file && !(TIPOS_MIME_PERMITIDOS as readonly string[]).includes(file.type)) {
      setErro("Tipo de arquivo não permitido. Use PDF, imagem, planilha, documento de texto ou CSV.");
      file = null;
    } else if (file && file.size > TAMANHO_MAXIMO) {
      setErro("O arquivo passa do limite de 20 MB.");
      file = null;
    }
    setArquivo(file);
    if (!file && inputRef.current) inputRef.current.value = "";
  }

  function enviar() {
    if (!arquivo) return setErro("Escolha um arquivo.");
    setErro(null);
    startTransition(async () => {
      setEtapa("Preparando...");
      const prep = await prepararEnvio(destino, { nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
      if (!prep.ok) {
        setEtapa(null);
        return setErro(prep.error);
      }
      setEtapa("Enviando arquivo...");
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .uploadToSignedUrl(prep.data!.path, prep.data!.token, arquivo, { contentType: arquivo.type });
      if (error) {
        setEtapa(null);
        return setErro("Falha no envio do arquivo. Tente novamente.");
      }
      setEtapa("Registrando...");
      const res = await registrarDocumento(destino, {
        tipo,
        descricao,
        nome_arquivo: arquivo.name,
        storage_path: prep.data!.path,
        mime_type: arquivo.type as (typeof TIPOS_MIME_PERMITIDOS)[number],
        tamanho_bytes: arquivo.size,
      });
      setEtapa(null);
      if (!res.ok) return setErro(res.error);
      setDescricao("");
      escolher(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Paperclip className="h-4 w-4" /> Anexar documento
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Anexar documento">
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <Field label="Tipo de documento" htmlFor="tipo_documento" required>
            <Select id="tipo_documento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {TIPO_DOCUMENTO_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Arquivo" htmlFor="arquivo" required hint="PDF, imagem, planilha, documento de texto ou CSV, até 20 MB.">
            <Input
              ref={inputRef}
              id="arquivo"
              type="file"
              accept={ACCEPT_INPUT}
              className="h-auto py-1.5"
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Descrição" htmlFor="descricao_documento">
            <Textarea id="descricao_documento" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <div className="flex items-center justify-end gap-2">
            {etapa && <span className="mr-auto text-sm text-slate-500">{etapa}</span>}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={enviar} disabled={pending || !arquivo}>
              {pending ? "Enviando..." : "Anexar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function RemoverDocumento({ destino, documento }: { destino: Destino; documento: Documento }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const res = await removerDocumento(destino, documento.id, motivo);
      if (!res.ok) return setErro(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-red-600" title="Remover" aria-label="Remover documento">
        <Trash2 className="h-4 w-4" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Remover documento">
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <p className="text-sm text-slate-600">
            {documento.nome_arquivo} sai da lista. O arquivo e o registro continuam guardados no histórico.
          </p>
          <Field label="Motivo da remoção" htmlFor={`motivo-doc-${documento.id}`} required>
            <Textarea id={`motivo-doc-${documento.id}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmar} disabled={pending || motivo.trim().length < 3}>
              {pending ? "Removendo..." : "Remover"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
