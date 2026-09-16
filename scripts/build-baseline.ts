#!/usr/bin/env node
/**
 * Reconstrói do zero a base de dados do projeto (data/employees.json,
 * data/pagamentos.json, data/documentos.json, data/comprovantes/) a partir de:
 *   1. Um ZIP com todos os comprovantes/relatórios em PDF (mesma estrutura de
 *      pastas usada no "PAGAMENTO.zip" original: MES/DATA/arquivo.pdf).
 *   2. A planilha de funcionários mais atual.
 *
 * Por que reconstruir em vez de só fazer upload pela tela "Anexar arquivos"?
 * Porque isso processa TODOS os arquivos de uma vez, com o motor de leitura
 * mais atual do projeto (o mesmo usado em produção — este script importa
 * diretamente de src/lib), e grava tudo como parte do próprio projeto,
 * sem depender de armazenamento externo (Vercel Blob) e sem o limite de
 * tamanho de upload por requisição do Vercel.
 *
 * Uso:
 *   npx tsx scripts/build-baseline.ts --zip caminho/para/PAGAMENTO.zip --planilha caminho/para/planilha.xlsx
 *
 * (o comando "npm run build-baseline -- --zip ... --planilha ..." faz a mesma coisa)
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

import { parseEmployeesSpreadsheet } from "../src/lib/sheetExtract";
import { parseReceiptPdf } from "../src/lib/pdfExtract";
import {
  pareceLotePix,
  pareceRelatorioDeLote,
  pareceRelatorioPagamentosRealizados,
  parseLotePix,
  parseRelatorioDeLote,
  parseRelatorioPagamentosRealizados,
  linhasParaPagamentos,
} from "../src/lib/batchExtract";
import { construirMapaValorTipo, sugerirTipoPorValor } from "../src/lib/valorHeuristica";
import { normalizeCpf } from "../src/lib/normalize";
import { buildFuncionarioIndexes, matchFuncionario } from "../src/lib/match";
import { employeeId } from "../src/lib/employeeId";
import type { Documento, Funcionario, Pagamento } from "../src/lib/types";

function argValor(nome: string): string | null {
  const idx = process.argv.indexOf(`--${nome}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const ZIP_PATH = argValor("zip");
const PLANILHA_PATH = argValor("planilha");
const DATA_DIR = path.join(process.cwd(), "data");

if (!ZIP_PATH || !PLANILHA_PATH) {
  console.error("Uso: npx tsx scripts/build-baseline.ts --zip <arquivo.zip> --planilha <arquivo.xlsx>");
  process.exit(1);
}

function ehArquivoDeLote(nomeArquivo: string): boolean {
  return /Max Serv|Banco do Brasil - Geral/i.test(nomeArquivo);
}

function distanciaDatas(a: string | null, b: string | null): number {
  if (!a || !b) return 9999;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 9999;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

async function main() {
  console.log("== 1. Lendo planilha de funcionários ==");
  const planilhaBytes = fs.readFileSync(PLANILHA_PATH!);
  const { funcionarios, avisos } = parseEmployeesSpreadsheet(planilhaBytes);
  console.log(`Funcionários lidos: ${funcionarios.length}`);
  avisos.forEach((a) => console.log("  aviso:", a));

  console.log("\n== 2. Abrindo ZIP de comprovantes ==");
  const zip = new AdmZip(ZIP_PATH!);
  const entradas = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".pdf"));
  console.log(`PDFs encontrados no zip: ${entradas.length}`);

  const lote = entradas.filter((e) => ehArquivoDeLote(path.basename(e.entryName)));
  const individuais = entradas.filter((e) => !ehArquivoDeLote(path.basename(e.entryName)));
  console.log(`  Relatórios em lote: ${lote.length}`);
  console.log(`  Comprovantes individuais: ${individuais.length}`);

  console.log("\n== 3. Processando relatórios em lote ==");
  const pagamentos: Pagamento[] = [];
  let lotesSemTexto = 0;
  let lotesNaoReconhecidos = 0;

  for (const entrada of lote) {
    const bytes = entrada.getData();
    const nomeArquivo = path.basename(entrada.entryName);
    let texto = "";
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const resultado = await pdfParse(bytes);
      texto = resultado.text || "";
    } catch {
      texto = "";
    }
    if (!texto.trim()) {
      lotesSemTexto++;
      console.log(`  (sem texto extraível, ignorado) ${nomeArquivo}`);
      continue;
    }

    if (pareceRelatorioPagamentosRealizados(texto)) {
      const { periodo, linhas } = parseRelatorioPagamentosRealizados(texto, nomeArquivo);
      pagamentos.push(...linhasParaPagamentos(linhas, periodo, nomeArquivo, "upload_lote_bancario"));
      console.log(`  [Pagamentos Realizados] ${nomeArquivo} -> ${linhas.length} linha(s)`);
      continue;
    }
    if (pareceRelatorioDeLote(texto)) {
      const { periodo, linhas } = parseRelatorioDeLote(texto, nomeArquivo);
      pagamentos.push(...linhasParaPagamentos(linhas, periodo, nomeArquivo, "relatorio_lote"));
      console.log(`  [Relatório de lote] ${nomeArquivo} -> ${linhas.length} linha(s)`);
      continue;
    }
    if (pareceLotePix(texto)) {
      const linhas = parseLotePix(texto, nomeArquivo);
      pagamentos.push(...linhasParaPagamentos(linhas, null, nomeArquivo, "pix_individual_lote"));
      console.log(`  [Lote Pix] ${nomeArquivo} -> ${linhas.length} linha(s)`);
      continue;
    }
    lotesNaoReconhecidos++;
    console.log(`  !! FORMATO NÃO RECONHECIDO: ${nomeArquivo} (verifique manualmente)`);
  }

  console.log(`\nTotal de pagamentos extraídos dos lotes: ${pagamentos.length}`);
  console.log(`Lotes sem texto: ${lotesSemTexto} | não reconhecidos: ${lotesNaoReconhecidos}`);

  console.log("\n== 4. Aplicando heurística de tipo por valor (para linhas ainda sem tipo) ==");
  const mapaValorTipo = construirMapaValorTipo(pagamentos);
  let enriquecidos = 0;
  for (const p of pagamentos) {
    if (p.tipo === "NAO_IDENTIFICADO") {
      const sugestao = sugerirTipoPorValor(p.valor, mapaValorTipo);
      if (sugestao) {
        p.tipo = sugestao;
        enriquecidos++;
      }
    }
  }
  console.log(`Pagamentos enriquecidos por valor: ${enriquecidos}`);

  console.log("\n== 4b. Vinculando pagamentos a funcionários (para poder cruzar por valor exato) ==");
  const { cpfIndex, nomeIndex, porPrimeiraPalavra } = buildFuncionarioIndexes(funcionarios);
  const pagamentosPorFuncionario = new Map<string, Pagamento[]>();
  for (const p of pagamentos) {
    const f = matchFuncionario(p.nomeNorm, p.cpf, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
    if (!f) continue;
    const id = employeeId(f);
    const arr = pagamentosPorFuncionario.get(id) || [];
    arr.push(p);
    pagamentosPorFuncionario.set(id, arr);
  }
  console.log(`Funcionários com pelo menos 1 pagamento vinculado: ${pagamentosPorFuncionario.size}`);

  console.log("\n== 5. Processando comprovantes individuais ==");
  const documentos: Documento[] = [];
  const comprovantesDir = path.join(DATA_DIR, "comprovantes");
  await fsp.rm(comprovantesDir, { recursive: true, force: true });

  let copiados = 0;

  for (const entrada of individuais) {
    const bytes = entrada.getData();
    const nomeArquivo = path.basename(entrada.entryName);
    // caminho relativo dentro de data/comprovantes, removendo o prefixo raiz do zip
    const partes = entrada.entryName.split("/").filter(Boolean);
    const relPath = partes.slice(1).join("/"); // remove a primeira pasta (ex: "PAGAMENTO/")

    let parsed;
    try {
      parsed = await parseReceiptPdf(nomeArquivo, bytes, null);
    } catch (err) {
      console.log(`  !! erro ao processar ${nomeArquivo}:`, (err as Error).message);
      continue;
    }

    if (!parsed.valorDetectado && !parsed.cpfDetectado && parsed.nomeDetectado === nomeArquivo.replace(/\.pdf$/i, "")) {
      console.log(`  (não parece comprovante válido, ignorado) ${nomeArquivo}`);
      continue;
    }

    const destino = path.join(comprovantesDir, relPath);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.writeFile(destino, bytes);
    copiados++;

    const funcionarioMatch = matchFuncionario(parsed.nomeNorm, parsed.cpfDetectado, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
    const cpfFinal = parsed.cpfDetectado || (funcionarioMatch ? normalizeCpf(funcionarioMatch.cpf) : null);

    let tipo = parsed.tipoDetectado;
    let situacao = parsed.situacaoDetectada;
    let fonteClassificacao: string | null = tipo !== "NAO_IDENTIFICADO" ? "texto_pdf" : null;

    if (tipo === "NAO_IDENTIFICADO" && funcionarioMatch && parsed.valorDetectado !== null) {
      // Cruza pelo histórico de pagamentos DESTE funcionário com o MESMO valor
      // exato do comprovante — é o método mais confiável (evita adivinhar
      // usando estatística global, que pode errar em valores raros).
      const candidatos = (pagamentosPorFuncionario.get(employeeId(funcionarioMatch)) || []).filter(
        (p) => p.valor !== null && Math.abs(p.valor - parsed.valorDetectado!) < 0.01 && p.tipo !== "NAO_IDENTIFICADO"
      );
      if (candidatos.length > 0) {
        const melhor = candidatos.sort((a, b) => distanciaDatas(a.data, parsed.dataDetectada) - distanciaDatas(b.data, parsed.dataDetectada))[0];
        tipo = melhor.tipo;
        situacao = melhor.situacao;
        fonteClassificacao = "relatorio_lote";
      }
    }
    if (tipo === "NAO_IDENTIFICADO") {
      const sugestao = sugerirTipoPorValor(parsed.valorDetectado, mapaValorTipo);
      if (sugestao) {
        tipo = sugestao;
        fonteClassificacao = "heuristica_valor";
      }
    }

    documentos.push({
      id: partes.join("/"), // mantém o "PAGAMENTO/..." completo como id, como no formato original
      nome: parsed.nomeDetectado || nomeArquivo,
      nomeNorm: parsed.nomeNorm,
      cpf: cpfFinal,
      tipo,
      situacao: situacao,
      valor: parsed.valorDetectado,
      data: parsed.dataDetectada,
      complemento: parsed.complemento,
      fonteClassificacao,
      arquivoRelativo: relPath,
    });
  }

  console.log(`Comprovantes copiados: ${copiados}`);
  console.log(`Documentos com tipo identificado: ${documentos.filter((d) => d.tipo !== "NAO_IDENTIFICADO").length} / ${documentos.length}`);

  console.log("\n== 6. Gravando arquivos finais ==");
  await fsp.writeFile(path.join(DATA_DIR, "employees.json"), JSON.stringify(funcionarios, null, 1));
  await fsp.writeFile(path.join(DATA_DIR, "pagamentos.json"), JSON.stringify(pagamentos, null, 1));
  await fsp.writeFile(path.join(DATA_DIR, "documentos.json"), JSON.stringify(documentos, null, 1));

  // Limpa uploads acumulados anteriormente — já foram incorporados na base nova.
  await fsp.rm(path.join(DATA_DIR, "uploads"), { recursive: true, force: true });

  console.log("\nConcluído!");
  console.log(`  data/employees.json  (${funcionarios.length} funcionários)`);
  console.log(`  data/pagamentos.json (${pagamentos.length} registros)`);
  console.log(`  data/documentos.json (${documentos.length} comprovantes)`);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
