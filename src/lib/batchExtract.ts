import { normalizeCpf, normalizeName, parseBrValor } from "./normalize";
import type { Pagamento, Situacao, TipoBeneficio } from "./types";

export interface LinhaLote {
  nome: string;
  nomeNorm: string;
  cpf: string | null;
  tipo: TipoBeneficio;
  situacao: Situacao;
  valor: number | null;
}

export interface RelatorioLoteParseado {
  periodo: string | null;
  linhas: LinhaLote[];
}

// IMPORTANTE: o extrator de texto usado aqui (pdf-parse, em Node) concatena o
// texto de campos vizinhos SEM espaço entre eles quando o PDF não tem espaços
// reais no layout — por isso os padrões abaixo não dependem de espaços entre
// nome/CPF/situação/tipo, apenas dos formatos fixos de cada campo (CPF com
// pontuação, agência/conta no formato NNNN-D, valores em R$, etc).
const ROW_RE =
  /(\d+)([A-Za-zÀ-ÿ.\-'\s]{3,60}?)(\d{3}\.\d{3}\.\d{3}-\d{2})(\d+-[\dXx]\s*\/\s*\d+-[\dXx])(Pago|Devolvido|Rejeitado|Pendente|Cancelado|Estornado|Agendado|Processando)(Vale Transporte|Auxílio|Auxilio|Sal[aá]rio)?R\$\s*([\d.]+,\d{2})/g;

const PIX_BLOCK_RE =
  /Comprovante Pix( Rejeitado)?[\s\S]*?VALOR:\s*R\$\s*([\d.]+,\d{2})[\s\S]*?(?:MOTIVO\s+([^\n]+))?[\s\S]*?PAGO PARA:\s*([^\n]+)\nCPF:\s*([^\n]+)/g;

function tipoDoTexto(raw: string | undefined | null): TipoBeneficio {
  if (!raw) return "NAO_IDENTIFICADO";
  if (/ux/i.test(raw)) return "AUXILIO";
  if (/Transporte/i.test(raw)) return "VT";
  if (/al[aá]rio/i.test(raw)) return "SALARIO";
  return "NAO_IDENTIFICADO";
}

function situacaoValida(raw: string): Situacao {
  if (raw === "Pago") return "Pago";
  if (raw === "Cancelado" || raw === "Estornado" || raw === "Devolvido") return "Cancelado";
  if (raw === "Rejeitado") return "Rejeitado";
  return "Pendente";
}

/** Reconhece o formato de "relatório de folha" (tabela Nome/CPF/Situação/Tipo/Valor) usado pelos retornos do banco. */
export function pareceRelatorioDeLote(texto: string): boolean {
  if (/Relatório Folha Pagamentos/i.test(texto)) return true;
  const matches = texto.match(ROW_RE);
  return !!matches && matches.length >= 3;
}

export function parseRelatorioDeLote(texto: string): RelatorioLoteParseado {
  // Ex.: "Auxílio1243" (tipo do lote seguido, sem espaço, da quantidade de pagamentos)
  const tipoHeaderMatch = /(Vale Transporte|Auxílio|Auxilio|Sal[aá]rio)\d+/.exec(texto);
  const tipoHeader = tipoHeaderMatch ? tipoDoTexto(tipoHeaderMatch[1]) : null;
  // Ex.: "TRE VA 19_21agosto26.xls" (nome do arquivo de folha usado internamente pelo banco)
  const folhaMatch = /([A-Za-zÀ-ÿ0-9 _-]+\.xlsx?)/i.exec(texto);
  const periodo = folhaMatch ? folhaMatch[1].trim() : null;

  const linhas: LinhaLote[] = [];
  ROW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROW_RE.exec(texto)) !== null) {
    const nome = m[2].trim();
    const tipoLinha = tipoDoTexto(m[6]);
    linhas.push({
      nome,
      nomeNorm: normalizeName(nome),
      cpf: normalizeCpf(m[3]),
      tipo: tipoLinha !== "NAO_IDENTIFICADO" ? tipoLinha : tipoHeader || "NAO_IDENTIFICADO",
      situacao: situacaoValida(m[5]),
      valor: parseBrValor(m[7]),
    });
  }

  return { periodo, linhas };
}

/** Reconhece relatórios de PIX individuais em lote (vários blocos "Comprovante Pix", um por transação). */
export function pareceLotePix(texto: string): boolean {
  const ocorrenciasPagoPara = (texto.match(/PAGO PARA:/gi) || []).length;
  // Um comprovante individual de Pix também contém "Comprovante Pix" e um único
  // "PAGO PARA:" — só tratamos como lote quando há MAIS DE UMA transação no arquivo.
  return ocorrenciasPagoPara >= 2;
}

export function parseLotePix(texto: string): LinhaLote[] {
  const linhas: LinhaLote[] = [];
  PIX_BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PIX_BLOCK_RE.exec(texto)) !== null) {
    const rejeitado = !!m[1];
    const nome = m[4].trim();
    linhas.push({
      nome,
      nomeNorm: normalizeName(nome),
      cpf: normalizeCpf(m[5]),
      tipo: "NAO_IDENTIFICADO",
      situacao: rejeitado ? "Rejeitado" : "Pago",
      valor: parseBrValor(m[2]),
    });
  }
  return linhas;
}

export function linhasParaPagamentos(
  linhas: LinhaLote[],
  periodo: string | null,
  fonteArquivo: string,
  origem: Pagamento["origem"]
): Pagamento[] {
  return linhas.map((l) => ({
    nome: l.nome,
    nomeNorm: l.nomeNorm,
    cpf: l.cpf,
    tipo: l.tipo,
    periodo,
    data: null,
    valor: l.valor,
    situacao: l.situacao,
    fonteArquivo,
    origem,
  }));
}
