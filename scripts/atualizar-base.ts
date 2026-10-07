#!/usr/bin/env node
/**
 * Atualiza a base do projeto (data/) de forma INCREMENTAL, sem apagar o que já existe:
 *
 *   - funcionários  → mescla a planilha nova com data/employees.json (mesmo critério da tela
 *                     "Anexar arquivos": atualiza quem já existe, adiciona quem é novo e
 *                     mantém quem sumiu da planilha);
 *   - pagamentos    → lê os relatórios do banco (Retorno/Remessa Bancária, PIX em lote,
 *                     Pagamentos Realizados) e acrescenta em data/pagamentos.json. Um relatório
 *                     que já estava na base é SUBSTITUÍDO (não duplicado), mesmo que o nome do
 *                     arquivo tenha mudado um pouco (ex: sufixo "_Ordem_Alfabética");
 *   - comprovantes  → os PDFs individuais (um por pessoa) são copiados para data/comprovantes e
 *                     registrados em data/documentos.json (os que já existem são ignorados).
 *
 * Diferente do build-baseline.ts (que reconstrói TUDO e exige o ZIP completo de todos os meses),
 * este script só precisa dos arquivos NOVOS — por isso é o caminho normal para a atualização
 * mensal. Também não tem o limite de 4MB por arquivo da tela de upload.
 *
 * Uso (pode repetir --zip e --pasta quantas vezes quiser):
 *   npm run atualizar-base -- --planilha "PLANILHA.xlsx" --zip "09 - SETEMBRO.zip" --zip "10 - OUTUBRO.zip"
 *   npm run atualizar-base -- --pasta "C:/caminho/10 - OUTUBRO" --dry-run
 *
 * --dry-run: só mostra o que seria feito, sem gravar nada.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

import { parseEmployeesSpreadsheet } from "../src/lib/sheetExtract";
import { mesclarFuncionarios } from "../src/lib/mergeFuncionarios";
import { parseReceiptPdf } from "../src/lib/pdfExtract";
import {
  linhasParaPagamentos,
  pareceLotePix,
  pareceRelatorioDeLote,
  pareceRelatorioPagamentosRealizados,
  parseLotePix,
  parseRelatorioDeLote,
  parseRelatorioPagamentosRealizados,
  type LinhaLote,
} from "../src/lib/batchExtract";
import { construirMapaValorTipo, sugerirTipoPorValor } from "../src/lib/valorHeuristica";
import { buildFuncionarioIndexes, matchFuncionario } from "../src/lib/match";
import { normalizeCpf, stripAccents } from "../src/lib/normalize";
import { employeeId } from "../src/lib/employeeId";
import type { Documento, Funcionario, Pagamento } from "../src/lib/types";

// ---------- argumentos ----------
function argValores(nome: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === `--${nome}` && i + 1 < process.argv.length) out.push(process.argv[i + 1]);
  });
  return out;
}
const PLANILHA = argValores("planilha")[0] || null;
const ZIPS = argValores("zip");
const PASTAS = argValores("pasta");
const DRY_RUN = process.argv.includes("--dry-run");
const DATA_DIR = path.join(process.cwd(), "data");

if (!PLANILHA && ZIPS.length === 0 && PASTAS.length === 0) {
  console.error('Uso: npm run atualizar-base -- [--planilha arq.xlsx] [--zip arq.zip]... [--pasta pasta]... [--dry-run]');
  process.exit(1);
}

// ---------- coleta dos PDFs ----------
interface ArquivoPdf {
  nome: string; // só o nome do arquivo
  relPath: string; // "10 - OUTUBRO/2026-10-05/arquivo.pdf" (a partir da pasta do mês)
  bytes: Buffer;
}

/** Corta o caminho a partir da pasta do mês ("09 - SETEMBRO"), para casar com o padrão de data/comprovantes. */
function relPathAPartirDoMes(partes: string[]): string {
  const idx = partes.findIndex((p) => /^\d{2} - \S/.test(p));
  return (idx >= 0 ? partes.slice(idx) : partes).join("/");
}

function coletarPdfs(): ArquivoPdf[] {
  const achados: ArquivoPdf[] = [];

  for (const zipPath of ZIPS) {
    const zip = new AdmZip(zipPath);
    for (const e of zip.getEntries()) {
      if (e.isDirectory || !e.entryName.toLowerCase().endsWith(".pdf")) continue;
      const partes = e.entryName.split("/").filter(Boolean);
      if (partes.includes("__MACOSX")) continue;
      achados.push({ nome: partes[partes.length - 1], relPath: relPathAPartirDoMes(partes), bytes: e.getData() });
    }
  }

  const percorrer = (dir: string, partes: string[]) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, ent.name);
      if (ent.isDirectory()) percorrer(caminho, [...partes, ent.name]);
      else if (ent.name.toLowerCase().endsWith(".pdf")) {
        achados.push({ nome: ent.name, relPath: relPathAPartirDoMes([...partes, ent.name]), bytes: fs.readFileSync(caminho) });
      }
    }
  };
  for (const pasta of PASTAS) percorrer(pasta, [path.basename(path.resolve(pasta))]);

  // Um mesmo arquivo pode aparecer em duas pastas (ex: "CERIMONIA DE LACRAÇÃO- PAGAMENTO" repete os
  // relatórios que também estão nas pastas por data). Mantém só um de cada (mesmo nome + mesmo tamanho).
  const vistos = new Set<string>();
  const unicos: ArquivoPdf[] = [];
  for (const a of achados) {
    const chave = `${a.nome}|${a.bytes.length}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(a);
  }
  return unicos;
}

/** Chave estável para reconhecer "o mesmo relatório" mesmo com pequenas mudanças no nome do arquivo. */
function chaveDeArquivo(nome: string): string {
  return stripAccents(nome)
    .toLowerCase()
    .replace(/\.pdf$/, "")
    .replace(/_ordem_alfabetica/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function distanciaDatas(a: string | null, b: string | null): number {
  if (!a || !b) return 9999;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 9999;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

/** Mesmo comprovante (mesmo id) registrado duas vezes: fica o que já tem tipo definido. */
function removerDocumentosRepetidos(docs: Documento[]): Documento[] {
  const porId = new Map<string, Documento>();
  for (const d of docs) {
    const atual = porId.get(d.id);
    if (!atual || (atual.tipo === "NAO_IDENTIFICADO" && d.tipo !== "NAO_IDENTIFICADO")) porId.set(d.id, d);
  }
  return [...porId.values()];
}

function lerJson<T>(arquivo: string, padrao: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, arquivo), "utf-8")) as T;
  } catch {
    return padrao;
  }
}

async function main() {
  console.log(DRY_RUN ? "*** MODO DE TESTE (--dry-run): nada será gravado ***\n" : "");

  // ---------- 1. funcionários ----------
  let funcionarios = lerJson<Funcionario[]>("employees.json", []);
  if (PLANILHA) {
    console.log("== 1. Funcionários ==");
    const { funcionarios: novos, avisos } = parseEmployeesSpreadsheet(fs.readFileSync(PLANILHA));
    avisos.forEach((a) => console.log("  aviso:", a));
    if (novos.length === 0) throw new Error("A planilha não trouxe nenhum funcionário — abortando para não perder dados.");
    const antes = funcionarios.length;
    const cpfsNovaPlanilha = new Set(novos.map((n) => n.cpf));
    const r = mesclarFuncionarios(funcionarios, novos);
    funcionarios = r.resultado;
    const ausentes = lerJson<Funcionario[]>("employees.json", []).filter((f) => f.cpf && !cpfsNovaPlanilha.has(f.cpf));
    console.log(`  Na planilha: ${novos.length} | antes: ${antes} | depois: ${funcionarios.length}`);
    console.log(`  Novos: ${r.novosAdicionados} | atualizados: ${r.atualizados} | sem alteração: ${r.mantidosSemAlteracao}`);
    if (ausentes.length > 0) {
      console.log(`  Mantidos mesmo fora da planilha nova (${ausentes.length}): ${ausentes.map((f) => f.nome).join("; ")}`);
    }
  }
  const { cpfIndex, nomeIndex, porPrimeiraPalavra } = buildFuncionarioIndexes(funcionarios);

  // ---------- 2. PDFs ----------
  const pdfs = coletarPdfs();
  console.log(`\n== 2. PDFs encontrados (sem repetidos): ${pdfs.length} ==`);

  let pagamentos = lerJson<Pagamento[]>("pagamentos.json", []);
  const documentosLidos = lerJson<Documento[]>("documentos.json", []);
  const documentos = removerDocumentosRepetidos(documentosLidos);
  if (documentos.length !== documentosLidos.length) {
    console.log(`  (removidos ${documentosLidos.length - documentos.length} comprovante(s) que estavam repetidos em documentos.json)`);
  }
  const pagamentosAntes = pagamentos.length;

  const novosPagamentos: Pagamento[] = [];
  const chavesSubstituidas = new Set<string>();
  const individuais: ArquivoPdf[] = [];
  const problemas: string[] = [];

  const pdfParse = (await import("pdf-parse")).default;

  console.log("\n== 3. Relatórios do banco ==");
  for (const pdf of pdfs.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    let texto = "";
    try {
      texto = (await pdfParse(pdf.bytes)).text || "";
    } catch {
      texto = "";
    }

    let linhas: LinhaLote[] | null = null;
    let periodo: string | null = null;
    let origem: Pagamento["origem"] = "relatorio_lote";
    let rotulo = "";
    let esperado: number | null = null;

    if (texto && pareceRelatorioPagamentosRealizados(texto)) {
      const r = parseRelatorioPagamentosRealizados(texto, pdf.nome);
      linhas = r.linhas;
      periodo = r.periodo;
      origem = "upload_lote_bancario";
      rotulo = "Pagamentos Realizados";
    } else if (texto && pareceRelatorioDeLote(texto)) {
      const r = parseRelatorioDeLote(texto, pdf.nome);
      linhas = r.linhas;
      periodo = r.periodo;
      origem = "relatorio_lote";
      rotulo = "Relatório de lote";
      // "Salário1540" → o número colado ao tipo é a quantidade de pagamentos declarada no cabeçalho.
      const q = /(?:Vale Transporte|Auxílio|Auxilio|Sal[aá]rio|Res?c?is[aã]o)(\d+)/.exec(texto);
      esperado = q ? parseInt(q[1], 10) : null;
    } else if (texto && pareceLotePix(texto)) {
      linhas = parseLotePix(texto, pdf.nome);
      origem = "pix_individual_lote";
      rotulo = "PIX em lote";
      esperado = (texto.match(/PAGO PARA:/gi) || []).length;
    }

    if (!linhas) {
      // Relatório do banco com formato desconhecido → avisa (nunca vira "comprovante" de pessoa).
      if (/retorno banc[aá]rio|remessa banc[aá]ria|max servi[cç]os|relat[oó]rio.{0,20}pagamento/i.test(pdf.nome) && !/\bpix\b/i.test(pdf.nome)) {
        problemas.push(`Formato não reconhecido: ${pdf.nome}`);
        console.log(`  !! FORMATO NÃO RECONHECIDO: ${pdf.nome}`);
      } else {
        individuais.push(pdf);
      }
      continue;
    }

    const divergente = esperado !== null && esperado !== linhas.length;
    if (divergente) problemas.push(`${pdf.nome}: o cabeçalho diz ${esperado} pagamento(s), mas foram lidos ${linhas.length}`);
    console.log(`  [${rotulo}] ${pdf.nome} → ${linhas.length} linha(s)${divergente ? `  !! esperado ${esperado}` : ""}`);

    chavesSubstituidas.add(chaveDeArquivo(pdf.nome));
    novosPagamentos.push(...linhasParaPagamentos(linhas, periodo, pdf.nome, origem));
  }

  // Relatórios que já estavam na base são substituídos pela leitura nova (evita duplicar).
  const removidos = pagamentos.filter((p) => chavesSubstituidas.has(chaveDeArquivo(p.fonteArquivo))).length;
  pagamentos = pagamentos.filter((p) => !chavesSubstituidas.has(chaveDeArquivo(p.fonteArquivo)));

  // Mesma ideia do build-baseline: para linhas sem tipo, usa o tipo dominante daquele valor exato.
  const mapaValorTipo = construirMapaValorTipo([...pagamentos, ...novosPagamentos]);
  let porValor = 0;
  for (const p of novosPagamentos) {
    if (p.tipo === "NAO_IDENTIFICADO") {
      const s = sugerirTipoPorValor(p.valor, mapaValorTipo);
      if (s) {
        p.tipo = s;
        porValor++;
      }
    }
  }
  pagamentos = [...pagamentos, ...novosPagamentos];
  console.log(`\n  Registros substituídos (já estavam na base): ${removidos} | novos lidos: ${novosPagamentos.length} | tipo definido pelo valor: ${porValor}`);
  console.log(`  Total de pagamentos: ${pagamentosAntes} → ${pagamentos.length}`);

  // ---------- 4. comprovantes individuais ----------
  console.log("\n== 4. Comprovantes individuais ==");
  const jaExistem = new Set(documentos.map((d) => chaveDeArquivo(d.arquivoRelativo)));
  const pagPorFuncionario = new Map<string, Pagamento[]>();
  for (const p of pagamentos) {
    const f = matchFuncionario(p.nomeNorm, p.cpf, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
    if (!f) continue;
    const id = employeeId(f);
    const arr = pagPorFuncionario.get(id) || [];
    arr.push(p);
    pagPorFuncionario.set(id, arr);
  }

  const novosDocs: Documento[] = [];
  for (const pdf of individuais) {
    if (jaExistem.has(chaveDeArquivo(pdf.relPath))) {
      console.log(`  (já existe) ${pdf.nome}`);
      continue;
    }
    const parsed = await parseReceiptPdf(pdf.nome, pdf.bytes, null);
    if (!parsed.valorDetectado && !parsed.cpfDetectado && parsed.nomeDetectado === pdf.nome.replace(/\.pdf$/i, "")) {
      problemas.push(`Não parece um comprovante válido (ignorado): ${pdf.nome}`);
      console.log(`  !! ignorado (não parece comprovante): ${pdf.nome}`);
      continue;
    }

    const f = matchFuncionario(parsed.nomeNorm, parsed.cpfDetectado, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
    const cpfFinal = parsed.cpfDetectado || (f ? normalizeCpf(f.cpf) : null);

    let tipo = parsed.tipoDetectado;
    let situacao = parsed.situacaoDetectada;
    let fonte: string | null = tipo !== "NAO_IDENTIFICADO" ? "texto_pdf" : null;

    if (tipo === "NAO_IDENTIFICADO" && f && parsed.valorDetectado !== null) {
      const candidatos = (pagPorFuncionario.get(employeeId(f)) || []).filter(
        (p) => p.valor !== null && Math.abs(p.valor - parsed.valorDetectado!) < 0.01 && p.tipo !== "NAO_IDENTIFICADO"
      );
      if (candidatos.length > 0) {
        const melhor = candidatos.sort((a, b) => distanciaDatas(a.data, parsed.dataDetectada) - distanciaDatas(b.data, parsed.dataDetectada))[0];
        tipo = melhor.tipo;
        situacao = melhor.situacao;
        fonte = "relatorio_lote";
      }
    }
    if (tipo === "NAO_IDENTIFICADO") {
      const s = sugerirTipoPorValor(parsed.valorDetectado, mapaValorTipo);
      if (s) {
        tipo = s;
        fonte = "heuristica_valor";
      }
    }

    novosDocs.push({
      id: `PAGAMENTO/${pdf.relPath}`, // mesmo formato dos comprovantes já existentes
      nome: parsed.nomeDetectado || pdf.nome,
      nomeNorm: parsed.nomeNorm,
      cpf: cpfFinal,
      tipo,
      situacao,
      valor: parsed.valorDetectado,
      data: parsed.dataDetectada,
      complemento: parsed.complemento,
      fonteClassificacao: fonte,
      arquivoRelativo: pdf.relPath,
    });
    console.log(
      `  + ${pdf.nome} → ${parsed.nomeDetectado} | ${tipo} | ${parsed.valorDetectado ?? "?"} | ${f ? "vinculado a " + f.nome : "SEM vínculo com a planilha"}`
    );
  }

  // ---------- 5. gravação ----------
  console.log("\n== 5. Resultado ==");
  console.log(`  employees.json  : ${funcionarios.length} funcionários`);
  console.log(`  pagamentos.json : ${pagamentos.length} registros`);
  console.log(`  documentos.json : ${documentos.length} → ${documentos.length + novosDocs.length} comprovantes`);
  if (problemas.length > 0) {
    console.log(`\n  ATENÇÃO — ${problemas.length} ponto(s) para conferir:`);
    problemas.forEach((p) => console.log("   -", p));
  }

  if (DRY_RUN) {
    console.log("\n(dry-run: nada foi gravado)");
    return;
  }

  for (const d of novosDocs) {
    const origem = individuais.find((i) => i.relPath === d.arquivoRelativo)!;
    const destino = path.join(DATA_DIR, "comprovantes", d.arquivoRelativo);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.writeFile(destino, origem.bytes);
  }
  await fsp.writeFile(path.join(DATA_DIR, "employees.json"), JSON.stringify(funcionarios, null, 1));
  await fsp.writeFile(path.join(DATA_DIR, "pagamentos.json"), JSON.stringify(pagamentos, null, 1));
  await fsp.writeFile(path.join(DATA_DIR, "documentos.json"), JSON.stringify([...documentos, ...novosDocs], null, 1));

  console.log("\nConcluído! Confira com `npm run dev` e depois faça o commit/push no GitHub.");
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
