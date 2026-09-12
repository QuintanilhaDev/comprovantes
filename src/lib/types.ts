export type TipoBeneficio = "SALARIO" | "VT" | "AUXILIO" | "NAO_IDENTIFICADO";

export type Situacao = "Pago" | "Cancelado" | "Rejeitado" | "Pendente";

export interface Funcionario {
  cpf: string; // 11 dígitos, pode ser "" se desconhecido
  cpfFormatado: string;
  nome: string;
  nomeNorm: string;
  polo?: number | string | null;
  zonaEleitoral?: number | string | null;
  municipioZona?: string | null;
  municipioPolo?: string | null;
  admissao?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  optanteVT?: boolean | null;
  telefone?: string | null;
  desligamento?: string | null;
  funcao?: string | null;
  posicaoVaga?: string | null;
  vinculo?: string | null;
  status?: string | null; // ATIVO | DESLIGADO | AFASTADO
  substitui?: string | null;
  observacao?: string | null;
}

/** Um registro do "extrato" oficial (relatório de lote do banco): a fonte mais confiável de tipo/situação. */
export interface Pagamento {
  nome: string;
  nomeNorm: string;
  cpf: string | null;
  tipo: TipoBeneficio;
  periodo: string | null; // ex: "TRE VA 19_21agosto26.xls"
  data: string | null; // ISO
  valor: number | null;
  situacao: Situacao;
  motivo?: string | null;
  fonteArquivo: string;
  origem: "relatorio_lote" | "pix_individual_lote" | "upload_manual" | "upload_lote_bancario" | "upload_pix_lote";
}

/** Um comprovante em PDF (documento) que pode ser exibido/baixado. */
export interface Documento {
  id: string;
  nome: string;
  nomeNorm: string;
  cpf: string | null;
  tipo: TipoBeneficio;
  situacao: Situacao;
  valor: number | null;
  data: string | null; // ISO
  complemento: boolean;
  fonteClassificacao: string | null;
  mesPasta?: string | null;
  dataPasta?: string | null;
  arquivoRelativo: string; // caminho relativo dentro de data/comprovantes (ou storage)
  origemUpload?: boolean;
}

export interface EmployeeSearchResult {
  funcionario: Funcionario;
  score: number;
  resumo: {
    totalDocumentos: number;
    totalPagamentos: number;
    ultimaAtualizacao: string | null;
    alertas: number; // pagamentos cancelados/rejeitados
  };
}

export interface EmployeeDetail {
  funcionario: Funcionario | null;
  pagamentos: Pagamento[];
  documentos: Documento[];
}
