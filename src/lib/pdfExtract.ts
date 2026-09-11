import { brDateToIso, normalizeCpf, normalizeName, parseBrValor } from "./normalize";
import type { Situacao, TipoBeneficio } from "./types";

export interface ParsedReceipt {
  nomeArquivo: string;
  nomeDetectado: string | null;
  nomeNorm: string;
  cpfDetectado: string | null;
  valorDetectado: number | null;
  dataDetectada: string | null; // ISO
  tipoDetectado: TipoBeneficio;
  situacaoDetectada: Situacao;
  complemento: boolean;
  textoEncontrado: boolean;
}

const FNAME_RE = /^(\d{4}-\d{2}-\d{2}) - (.+)\.pdf$/i;

/** Extrai nome/valor a partir do padrão de nome de arquivo usado pela folha (ex: "2026-08-11 - FULANO_R$ 99,00.pdf"). */
function parseFromFilename(filename: string) {
  const m = FNAME_RE.exec(filename);
  let resto = filename.replace(/\.pdf$/i, "");
  let dataArquivo: string | null = null;
  if (m) {
    dataArquivo = m[1];
    resto = m[2];
  }

  const complemento = /complemento/i.test(resto);

  const salarioMatch = /^sal[áa]rio\s*-\s*pix\s*-\s*(.+)$/i.exec(resto.trim());
  if (salarioMatch) {
    return { nome: salarioMatch[1].trim(), valor: null, dataArquivo, complemento, tipoHint: "SALARIO" as TipoBeneficio };
  }

  const valorMatch = /^(.+?)_R\$\s*([\d.]+,\d{2})(?:_.+)?$/.exec(resto);
  if (valorMatch) {
    return {
      nome: valorMatch[1].trim(),
      valor: parseBrValor(valorMatch[2]),
      dataArquivo,
      complemento,
      tipoHint: null as TipoBeneficio | null,
    };
  }

  const valorMatch2 = /^(.+?) R\$ ([\d.]+,\d{2})$/.exec(resto);
  if (valorMatch2) {
    return {
      nome: valorMatch2[1].trim(),
      valor: parseBrValor(valorMatch2[2]),
      dataArquivo,
      complemento,
      tipoHint: null as TipoBeneficio | null,
    };
  }

  // Não reconhecemos um padrão de nome de arquivo confiável (ex: veio de um scanner
  // com nome genérico) — devolve nome nulo para que o texto do PDF tenha prioridade.
  return { nome: null as string | null, valor: null, dataArquivo, complemento, tipoHint: null as TipoBeneficio | null };
}

/** Analisa o texto extraído do PDF (formatos conhecidos: comprovante Itaú / PIX Banco do Brasil). */
function parseFromText(text: string) {
  const out: {
    nome: string | null;
    cpf: string | null;
    valor: number | null;
    data: string | null;
    tagVtVa: "VT" | "VA" | null;
    rejeitado: boolean;
  } = { nome: null, cpf: null, valor: null, data: null, tagVtVa: null, rejeitado: false };

  const nomeMatch = /nome do recebedor:?\s*([^\n]+)/i.exec(text) || /PAGO PARA:\s*([^\n]+)/i.exec(text);
  if (nomeMatch) out.nome = nomeMatch[1].trim();

  const cpfMatch =
    /CPF\s*\/?\s*CNPJ do recebedor:?\s*([\d.\-/*]+)/i.exec(text) || /CPF:\s*([\d.\-*]+)/i.exec(text);
  if (cpfMatch) out.cpf = cpfMatch[1].trim();

  const valorMatch = /valor:?\s*R\$\s*([\d.]+,\d{2})/i.exec(text);
  if (valorMatch) out.valor = parseBrValor(valorMatch[1]);

  const dataMatch =
    /data da transfer[êe]ncia:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text) || /DATA:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  if (dataMatch) out.data = brDateToIso(dataMatch[1]);

  const msgMatch = /mensagem ao recebedor:?\s*(VT|VA)\b/i.exec(text);
  if (msgMatch) out.tagVtVa = msgMatch[1].toUpperCase() as "VT" | "VA";

  if (/PIX REJEITADO|Comprovante Pix Rejeitado/i.test(text)) out.rejeitado = true;

  return out;
}

/**
 * Processa um PDF de comprovante individual enviado pelo usuário.
 * Usa (1) o texto do PDF quando possível e (2) o padrão do nome do arquivo como apoio.
 * Se o tipo não puder ser detectado com confiança, retorna "NAO_IDENTIFICADO" — a tela
 * de upload permite o usuário escolher manualmente antes de confirmar.
 */
export async function parseReceiptPdf(filename: string, bytes: Buffer, tipoManual?: TipoBeneficio | null): Promise<ParsedReceipt> {
  const fromFilename = parseFromFilename(filename);

  let text = "";
  let textoEncontrado = false;
  try {
    // Import dinâmico evita custo de carregar pdf-parse quando não é necessário.
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(bytes);
    text = result.text || "";
    textoEncontrado = text.trim().length > 0;
  } catch {
    textoEncontrado = false;
  }

  const fromText = text ? parseFromText(text) : null;

  const nomeFinal = fromFilename.nome || fromText?.nome || filename.replace(/\.pdf$/i, "").trim();
  const valorFinal = fromFilename.valor ?? fromText?.valor ?? null;
  const dataFinal = fromFilename.dataArquivo || fromText?.data || null;

  let tipo: TipoBeneficio = "NAO_IDENTIFICADO";
  if (tipoManual) {
    tipo = tipoManual;
  } else if (fromText?.tagVtVa === "VT") {
    tipo = "VT";
  } else if (fromText?.tagVtVa === "VA") {
    tipo = "AUXILIO";
  } else if (fromFilename.tipoHint) {
    tipo = fromFilename.tipoHint;
  }

  const situacao: Situacao = fromText?.rejeitado ? "Rejeitado" : "Pago";

  return {
    nomeArquivo: filename,
    nomeDetectado: nomeFinal,
    nomeNorm: normalizeName(nomeFinal),
    cpfDetectado: fromText?.cpf ? normalizeCpf(fromText.cpf) : null,
    valorDetectado: valorFinal,
    dataDetectada: dataFinal,
    tipoDetectado: tipo,
    situacaoDetectada: situacao,
    complemento: fromFilename.complemento,
    textoEncontrado,
  };
}
