// Tipos das tabelas e views usadas pela aplicação.
// Valores NUMERIC chegam do PostgREST como number; use sempre lib/money para calcular.

export type Papel = "admin" | "operador" | "leitor";
export type StatusEmprestimo = "ativo" | "quitado" | "renegociado" | "cancelado";
export type TipoPessoa = "PF" | "PJ";
export type TipoImputacao = "juros" | "principal";
export type TipoMovimentoReserva = "aporte" | "resgate" | "utilizacao_pagamento";
export type SituacaoCompetencia = "paga" | "parcial" | "a_vencer" | "parcial_atrasada" | "atrasada";

type Num = number | string;

export interface Perfil {
  id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  ativo: boolean;
}

export interface Credor {
  id: string;
  nome: string;
  tipo_pessoa: TipoPessoa;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  dados_bancarios: string | null;
  observacoes: string | null;
  excluido_em: string | null;
  criado_em: string;
}

export interface Emprestimo {
  id: string;
  codigo: string;
  credor_id: string;
  valor_principal: Num;
  taxa_juros_mensal: Num;
  juros_mensal: Num;
  data_inicio: string;
  data_vencimento_principal: string;
  prazo_meses: number;
  juros_contratados_total: Num;
  valor_mensal_pagamento_planejado: Num;
  valor_mensal_reserva_planejado: Num;
  status: StatusEmprestimo;
  observacoes: string | null;
  excluido_em: string | null;
}

export interface EmprestimoPosicao {
  id: string;
  codigo: string;
  credor_id: string;
  credor_nome: string;
  status: StatusEmprestimo;
  valor_principal: Num;
  taxa_juros_mensal: Num;
  juros_mensal: Num;
  data_inicio: string;
  data_vencimento_principal: string;
  prazo_meses: number;
  juros_contratados_total: Num;
  juros_contratados_referencia: Num;
  valor_mensal_pagamento_planejado: Num;
  valor_mensal_reserva_planejado: Num;
  principal_pago: Num;
  principal_devido: Num;
  juros_devidos_ate_hoje: Num;
  juros_pagos: Num;
  juros_vencidos_nao_pagos: Num;
  juros_a_vencer: Num;
  competencias_atrasadas: number;
  total_pago: Num;
  qtd_pagamentos: number;
  reserva_aportes: Num;
  reserva_saidas: Num;
  reserva_saldo: Num;
  saldo_devedor_exigivel: Num;
  saldo_devedor_contratual: Num;
  proximo_vencimento: string | null;
  em_atraso: boolean;
  observacoes: string | null;
}

export interface Competencia {
  id: string;
  emprestimo_id: string;
  numero: number;
  data_vencimento: string;
  juros_devido: Num;
  principal_previsto: Num;
  pagamento_previsto: Num;
  reserva_prevista: Num;
  juros_pago: Num;
  juros_em_aberto: Num;
  vencida: boolean;
  situacao: SituacaoCompetencia;
  pagamento_realizado_mes: Num;
  reserva_realizada_mes: Num;
}

export interface Imputacao {
  id: string;
  tipo: TipoImputacao;
  competencia_id: string | null;
  valor: Num;
}

export interface Pagamento {
  id: string;
  emprestimo_id: string;
  data_pagamento: string;
  valor_total: Num;
  forma_pagamento: string | null;
  origem_reserva: boolean;
  observacoes: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
  criado_em: string;
  pagamento_imputacoes?: Imputacao[];
}

export interface MovimentoReserva {
  id: string;
  emprestimo_id: string;
  tipo: TipoMovimentoReserva;
  data_movimento: string;
  valor: Num;
  conta: string | null;
  pagamento_id: string | null;
  observacoes: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
  criado_em: string;
}

export interface RegistroAuditoria {
  id: number;
  tabela: string;
  registro_id: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE";
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  usuario_id: string | null;
  criado_em: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
