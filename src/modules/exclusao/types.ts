export type TipoExclusao = "credor" | "emprestimo" | "processo" | "acordo";

export interface OpcaoExclusao {
  tipo: TipoExclusao;
  id: string;
  rotulo: string;
  detalhe: string | null;
}
