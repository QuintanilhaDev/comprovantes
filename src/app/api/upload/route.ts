import { NextRequest, NextResponse } from "next/server";
import { addDocumentos, addPagamentos, getFuncionarios, getPagamentos, reclassificarNaoIdentificados } from "@/lib/data";
import { parseReceiptPdf } from "@/lib/pdfExtract";
import {
  linhasParaPagamentos,
  pareceLotePix,
  pareceRelatorioDeLote,
  pareceRelatorioPagamentosRealizados,
  parseLotePix,
  parseRelatorioDeLote,
  parseRelatorioPagamentosRealizados,
} from "@/lib/batchExtract";
import { construirMapaValorTipo, sugerirTipoPorValor } from "@/lib/valorHeuristica";
import { saveUploadedFile } from "@/lib/storage";
import { normalizeCpf } from "@/lib/normalize";
import type { Documento, Pagamento, TipoBeneficio } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Dá mais tempo para lotes com vários PDFs (só tem efeito em planos Pro/Enterprise
// do Vercel — no Hobby o limite máximo continua sendo ~10s por requisição).
export const maxDuration = 60;

const TIPOS_VALIDOS: TipoBeneficio[] = ["SALARIO", "VT", "AUXILIO", "NAO_IDENTIFICADO"];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const tipoManualRaw = form.get("tipo");
  const tipoManual: TipoBeneficio | null =
    typeof tipoManualRaw === "string" && TIPOS_VALIDOS.includes(tipoManualRaw as TipoBeneficio)
      ? (tipoManualRaw as TipoBeneficio)
      : null;

  if (files.length === 0) {
    return NextResponse.json({ erro: "Nenhum arquivo recebido." }, { status: 400 });
  }

  const funcionarios = await getFuncionarios();
  const porNome = new Map(funcionarios.map((f) => [f.nomeNorm, f]));

  // Usado como último recurso para "adivinhar" o tipo de pagamentos de Pix que
  // não mencionam VT/Auxílio em lugar nenhum (nem no texto, nem no nome do
  // arquivo) — ver lib/valorHeuristica.ts.
  const pagamentosExistentes = await getPagamentos();
  const mapaValorTipo = construirMapaValorTipo(pagamentosExistentes);

  const novosDocumentos: Documento[] = [];
  const novosPagamentos: Pagamento[] = [];
  const resultados: Array<{
    arquivo: string;
    status: "ok" | "erro";
    detalhe?: string;
    nomeDetectado?: string | null;
    tipo?: TipoBeneficio;
    funcionarioEncontrado?: boolean;
    ehRelatorioEmLote?: boolean;
    linhasEncontradas?: number;
    linhasVinculadas?: number;
  }> = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      resultados.push({ arquivo: file.name, status: "erro", detalhe: "Não é um arquivo PDF." });
      continue;
    }
    try {
      const bytes = Buffer.from(await file.arrayBuffer());

      // Primeiro, tenta ler o texto completo do PDF para checar se é um
      // relatório em lote (uma tabela com vários funcionários) em vez de um
      // comprovante individual.
      let textoCompleto = "";
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const resultado = await pdfParse(bytes);
        textoCompleto = resultado.text || "";
      } catch {
        textoCompleto = "";
      }

      if (textoCompleto && pareceRelatorioPagamentosRealizados(textoCompleto)) {
        const { periodo, linhas } = parseRelatorioPagamentosRealizados(textoCompleto, file.name);
        for (const l of linhas) {
          if (l.tipo === "NAO_IDENTIFICADO") {
            l.tipo = sugerirTipoPorValor(l.valor, mapaValorTipo) || "NAO_IDENTIFICADO";
          }
        }
        const pagamentos = linhasParaPagamentos(linhas, periodo, file.name, "upload_lote_bancario");
        novosPagamentos.push(...pagamentos);
        const vinculados = linhas.filter((l) => porNome.has(l.nomeNorm) || (l.cpf && funcionarios.some((f) => f.cpf === l.cpf))).length;
        resultados.push({
          arquivo: file.name,
          status: "ok",
          ehRelatorioEmLote: true,
          linhasEncontradas: linhas.length,
          linhasVinculadas: vinculados,
          detalhe: linhas.length === 0 ? "Relatório reconhecido, mas nenhuma linha de pagamento foi lida dele." : undefined,
        });
        continue;
      }

      if (textoCompleto && pareceRelatorioDeLote(textoCompleto)) {
        const { periodo, linhas } = parseRelatorioDeLote(textoCompleto, file.name);
        for (const l of linhas) {
          if (l.tipo === "NAO_IDENTIFICADO") {
            l.tipo = sugerirTipoPorValor(l.valor, mapaValorTipo) || "NAO_IDENTIFICADO";
          }
        }
        const pagamentos = linhasParaPagamentos(linhas, periodo, file.name, "upload_lote_bancario");
        novosPagamentos.push(...pagamentos);
        const vinculados = linhas.filter((l) => porNome.has(l.nomeNorm) || (l.cpf && funcionarios.some((f) => f.cpf === l.cpf))).length;
        resultados.push({
          arquivo: file.name,
          status: "ok",
          ehRelatorioEmLote: true,
          linhasEncontradas: linhas.length,
          linhasVinculadas: vinculados,
          detalhe: linhas.length === 0 ? "Relatório em lote reconhecido, mas sem nenhum pagamento nele (pode ser uma lista de pendências já vazia)." : undefined,
        });
        continue;
      }

      if (textoCompleto && pareceLotePix(textoCompleto)) {
        const linhas = parseLotePix(textoCompleto, file.name);
        for (const l of linhas) {
          if (l.tipo === "NAO_IDENTIFICADO") {
            l.tipo = sugerirTipoPorValor(l.valor, mapaValorTipo) || "NAO_IDENTIFICADO";
          }
        }
        const pagamentos = linhasParaPagamentos(linhas, null, file.name, "upload_pix_lote");
        novosPagamentos.push(...pagamentos);
        const vinculados = linhas.filter((l) => porNome.has(l.nomeNorm) || (l.cpf && funcionarios.some((f) => f.cpf === l.cpf))).length;
        resultados.push({
          arquivo: file.name,
          status: "ok",
          ehRelatorioEmLote: true,
          linhasEncontradas: linhas.length,
          linhasVinculadas: vinculados,
          detalhe: linhas.length === 0 ? "Lote de Pix reconhecido, mas nenhuma transação foi lida dele." : undefined,
        });
        continue;
      }

      // Segurança extra: um arquivo cujo nome parece claramente um relatório do
      // banco (contém "Retorno Bancário", "Max Serviços", etc.) nunca deve virar
      // um "comprovante individual" mesmo que não tenhamos reconhecido o formato
      // do texto — isso evitava criar um pagamento fantasma com o nome do
      // arquivo no lugar do nome de uma pessoa.
      if (/retorno banc[aá]rio|max servi[cç]os|relat[oó]rio.{0,20}pagamento/i.test(file.name)) {
        resultados.push({
          arquivo: file.name,
          status: "erro",
          detalhe: "Este arquivo parece um relatório do banco, mas não conseguimos reconhecer o formato interno dele. Nenhum dado foi importado — me envie este arquivo para eu ajustar o leitor.",
        });
        continue;
      }

      // Não é um relatório em lote — trata como comprovante individual de uma pessoa.
      const parsed = await parseReceiptPdf(file.name, bytes, tipoManual);

      if (!parsed.valorDetectado && !parsed.cpfDetectado && parsed.nomeDetectado === file.name.replace(/\.pdf$/i, "")) {
        // Não conseguimos identificar nome, CPF nem valor — bem provável que não
        // seja um comprovante de pagamento de verdade (ou tenha um formato que
        // ainda não reconhecemos). Melhor avisar do que inventar um registro.
        resultados.push({
          arquivo: file.name,
          status: "erro",
          detalhe: "Não conseguimos identificar um pagamento válido neste PDF (nem nome, nem CPF, nem valor). Nada foi importado.",
        });
        continue;
      }

      const relPath = `uploads/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      await saveUploadedFile(relPath, bytes, "application/pdf");

      const cpfDetectado = parsed.cpfDetectado || null;
      const funcionarioMatch = porNome.get(parsed.nomeNorm);
      const cpfFinal = cpfDetectado || (funcionarioMatch ? normalizeCpf(funcionarioMatch.cpf) : null);

      const id = `upload:${relPath}`;

      novosDocumentos.push({
        id,
        nome: parsed.nomeDetectado || file.name,
        nomeNorm: parsed.nomeNorm,
        cpf: cpfFinal,
        tipo: parsed.tipoDetectado,
        situacao: parsed.situacaoDetectada,
        valor: parsed.valorDetectado,
        data: parsed.dataDetectada,
        complemento: parsed.complemento,
        fonteClassificacao: parsed.tipoDetectado === "NAO_IDENTIFICADO" ? null : "upload_manual",
        arquivoRelativo: relPath,
        origemUpload: true,
      });

      novosPagamentos.push({
        nome: parsed.nomeDetectado || file.name,
        nomeNorm: parsed.nomeNorm,
        cpf: cpfFinal,
        tipo: parsed.tipoDetectado,
        periodo: null,
        data: parsed.dataDetectada,
        valor: parsed.valorDetectado,
        situacao: parsed.situacaoDetectada,
        fonteArquivo: file.name,
        origem: "upload_manual",
      });

      resultados.push({
        arquivo: file.name,
        status: "ok",
        nomeDetectado: parsed.nomeDetectado,
        tipo: parsed.tipoDetectado,
        funcionarioEncontrado: !!funcionarioMatch,
      });
    } catch (err) {
      resultados.push({ arquivo: file.name, status: "erro", detalhe: (err as Error).message });
    }
  }

  if (novosDocumentos.length > 0) {
    await addDocumentos(novosDocumentos);
  }
  if (novosPagamentos.length > 0) {
    await addPagamentos(novosPagamentos);
  }

  let reclassificados = 0;
  if (novosPagamentos.length > 0) {
    reclassificados = await reclassificarNaoIdentificados();
  }

  return NextResponse.json({ resultados, reclassificados });
}
