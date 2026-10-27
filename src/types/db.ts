// Tipos das tabelas e views usadas pela aplicação.
// Valores NUMERIC chegam do PostgREST como number; use sempre lib/money para calcular.

export type Papel = "admin" | "operador" | "leitor";
export type StatusEmprestimo = "ativo" | "quitado" | "renegociado" | "cancelado";
export type TipoPessoa = "PF" | "PJ";
export type TipoImputacao = "juros" | "principal";
export type TipoMovimentoReserva = "aporte" | "resgate" | "utilizacao_pagamento";
export type SituacaoCompetencia = "paga" | "parcial" | "a_vencer" | "parcial_atrasada" | "atrasada" | "nao_devida";
export type StatusProcesso = "ativo" | "encerrado" | "arquivado";
export type PoloProcesso = "requerente" | "requerido";
export type StatusAcordo = "ativo" | "quitado" | "renegociado" | "cancelado";
export type ModoParcelas = "automatico" | "manual";
export type OrigemRecebimento = "manual" | "extrato";
export type SituacaoParcela = "recebida" | "parcial" | "a_vencer" | "em_carencia" | "parcial_atrasada" | "atrasada";
export type TipoDocumento = "ata_audiencia" | "sentenca" | "planilha_acordo" | "comprovante_protocolo" | "complementar";
export type TipoMovimentacao = "anotacao" | "processo" | "acordo" | "recebimento" | "protocolo" | "documento" | "operacao";
export type DestinoOperacao = "emprestimo" | "reserva" | "remanescente";
export type CotaOperacao = "emprestimo" | "reserva" | "livre";
export type SituacaoFinanceiraAcordo = "sem_parcelas" | "quitado" | "em_atraso" | "em_carencia" | "em_dia";

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
  data_quitacao_principal: string | null;
  competencias_pos_vencimento: number;
  juros_pos_vencimento: Num;
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
  /** Juros fixos do contrato, antes de eventual anulação pela quitação do principal. */
  juros_contratual: Num;
  pos_vencimento: boolean;
  anulada_por_quitacao: boolean;
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
  operacao_id: string | null;
  recebimento_id: string | null;
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
  operacao_id: string | null;
  recebimento_id: string | null;
}

export interface Processo {
  id: string;
  codigo: string;
  numero_processo: string | null;
  data_audiencia: string | null;
  status: StatusProcesso;
  observacoes: string | null;
  excluido_em: string | null;
  criado_em: string;
}

export interface ProcessoParte {
  id: string;
  processo_id: string;
  polo: PoloProcesso;
  nome: string;
  tipo_pessoa: TipoPessoa;
  documento: string | null;
  contato: string | null;
}

export interface ProcessoResumo {
  id: string;
  codigo: string;
  numero_processo: string | null;
  data_audiencia: string | null;
  status: StatusProcesso;
  observacoes: string | null;
  criado_em: string;
  requerentes: string;
  requeridos: string;
  qtd_acordos: number;
  qtd_acordos_ativos: number;
  valor_acordos_ativos: Num;
  recebido_acordos_ativos: Num;
  saldo_acordos_ativos: Num;
  parcelas_atrasadas: number;
  em_atraso: boolean;
  qtd_protocolos: number;
  protocolos_pendentes: number;
  tem_nupe: boolean;
  nupes: string;
}

export interface Acordo {
  id: string;
  codigo: string;
  processo_id: string;
  polo_pagador: PoloProcesso;
  valor_total: Num;
  condicoes_pagamento: string | null;
  dias_carencia: number;
  modo_parcelas: ModoParcelas;
  status: StatusAcordo;
  observacoes: string | null;
  excluido_em: string | null;
}

export interface AcordoPosicao {
  id: string;
  codigo: string;
  processo_id: string;
  processo_codigo: string;
  numero_processo: string | null;
  polo_pagador: PoloProcesso;
  valor_total: Num;
  condicoes_pagamento: string | null;
  dias_carencia: number;
  modo_parcelas: ModoParcelas;
  status: StatusAcordo;
  observacoes: string | null;
  criado_em: string;
  requerentes: string;
  requeridos: string;
  qtd_parcelas: number;
  soma_parcelas: Num;
  diferenca_parcelas: Num;
  total_recebido: Num;
  saldo_em_aberto: Num;
  parcelas_recebidas: number;
  parcelas_atrasadas: number;
  valor_atrasado: Num;
  parcelas_em_carencia: number;
  proximo_vencimento: string | null;
  qtd_recebimentos: number;
  ultimo_recebimento: string | null;
  situacao_financeira: SituacaoFinanceiraAcordo;
  em_atraso: boolean;
}

export interface ParcelaPosicao {
  id: string;
  acordo_id: string;
  processo_id: string;
  numero: number;
  valor: Num;
  data_vencimento: string;
  acordo_status: StatusAcordo;
  dias_carencia: number;
  data_limite: string;
  valor_recebido: Num;
  ultimo_recebimento: string | null;
  saldo: Num;
  situacao: SituacaoParcela;
  atrasada: boolean;
}

export interface RecebimentoImputacao {
  id: string;
  parcela_id: string;
  valor: Num;
}

export interface Recebimento {
  id: string;
  acordo_id: string;
  data_recebimento: string;
  valor: Num;
  parcela_indicada_id: string | null;
  forma_pagamento: string | null;
  origem: OrigemRecebimento;
  referencia_externa: string | null;
  observacoes: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
  criado_em: string;
  acordo_recebimento_imputacoes?: RecebimentoImputacao[];
}

export interface StatusProtocolo {
  id: string;
  nome: string;
  ordem: number;
  pendente: boolean;
  ativo: boolean;
}

export interface Protocolo {
  id: string;
  codigo: string;
  nupe: string | null;
  data_protocolo: string | null;
  status_id: string;
  responsavel_id: string;
  assunto: string | null;
  observacoes: string | null;
  excluido_em: string | null;
}

export interface ProtocoloView {
  id: string;
  codigo: string;
  nupe: string | null;
  data_protocolo: string | null;
  status_id: string;
  status_nome: string;
  pendente: boolean;
  responsavel_id: string;
  responsavel_nome: string | null;
  assunto: string | null;
  observacoes: string | null;
  criado_em: string;
  qtd_processos: number;
  processos: string;
  qtd_documentos: number;
}

export interface Usuario {
  id: string;
  nome: string;
}

export interface Documento {
  id: string;
  processo_id: string | null;
  protocolo_id: string | null;
  tipo: TipoDocumento;
  descricao: string | null;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  excluido_em: string | null;
  motivo_exclusao: string | null;
  criado_em: string;
  criado_por: string | null;
}

export interface Movimentacao {
  id: string;
  processo_id: string;
  data_movimentacao: string;
  tipo: TipoMovimentacao;
  descricao: string;
  automatica: boolean;
  referencia_tabela: string | null;
  referencia_id: string | null;
  criado_em: string;
  criado_por: string | null;
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

/** vw_operacoes */
export interface OperacaoView {
  id: string;
  codigo: string;
  acordo_id: string;
  acordo_codigo: string;
  processo_id: string;
  processo_codigo: string;
  numero_processo: string | null;
  emprestimo_id: string;
  emprestimo_codigo: string;
  credor_nome: string;
  emprestimo_juros_mensal: Num;
  percentual_emprestimo: Num;
  percentual_reserva: Num;
  percentual_livre: Num;
  observacoes: string | null;
  encerrada_em: string | null;
  motivo_encerramento: string | null;
  ativa: boolean;
  criado_em: string;
  total_juros: Num;
  total_reserva: Num;
  total_remanescente: Num;
  total_destinado: Num;
  ultima_destinacao: string | null;
  proxima_parcela_valor: Num | null;
  proxima_parcela_vencimento: string | null;
  contribuicao_juros_prevista: Num;
}

/** vw_operacao_destinacoes */
export interface DestinacaoView {
  id: string;
  operacao_id: string;
  operacao_codigo: string;
  recebimento_id: string;
  parcela_id: string;
  parcela_numero: number;
  emprestimo_id: string;
  emprestimo_codigo: string;
  acordo_id: string;
  acordo_codigo: string;
  processo_id: string;
  processo_codigo: string;
  data_destinacao: string;
  cota: CotaOperacao;
  destino: DestinoOperacao;
  valor: Num;
  pagamento_id: string | null;
  reserva_movimento_id: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
}

export interface FonteCobertura {
  operacao_id: string | null;
  operacao_codigo: string | null;
  acordo_codigo: string | null;
  processo_codigo: string | null;
  valor: Num;
}

/** vw_emprestimo_cobertura: competência atual de cada empréstimo e quem a pagou */
export interface CoberturaEmprestimo {
  emprestimo_id: string;
  competencia_id: string;
  numero: number;
  data_vencimento: string;
  juros_devido: Num;
  juros_pago: Num;
  juros_em_aberto: Num;
  situacao: SituacaoCompetencia;
  vencida: boolean;
  fontes: FonteCobertura[];
}

/** vw_emprestimo_quitacao_sugerida */
export interface QuitacaoSugerida {
  emprestimo_id: string;
  principal_devido: Num;
  reserva_saldo: Num;
  data_sugerida: string;
  reserva_cobre_principal: boolean;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
