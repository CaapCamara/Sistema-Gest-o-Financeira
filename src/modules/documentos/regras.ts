import type { TipoDocumento } from "@/types/db";

/** Espelha a configuração do bucket "documentos" (migração ..._protocolos_documentos.sql). */
export const BUCKET_DOCUMENTOS = "documentos";
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;
export const TIPOS_MIME_PERMITIDOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "text/csv",
] as const;
export const ACCEPT_INPUT = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.ods,.odt,.csv";

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  ata_audiencia: "Ata de audiência",
  sentenca: "Sentença",
  planilha_acordo: "Planilha do acordo",
  comprovante_protocolo: "Comprovante de protocolo",
  complementar: "Documento complementar",
};

export const TIPOS_DOCUMENTO = Object.keys(TIPO_DOCUMENTO_LABEL) as TipoDocumento[];

/** Nome seguro para o caminho no Storage (sem acentos, espaços ou barras). */
export function nomeSeguro(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "");
  return (base || "arquivo").slice(-100);
}

export function formatTamanho(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
