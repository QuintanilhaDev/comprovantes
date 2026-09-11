#!/usr/bin/env node
/**
 * Consolida os uploads feitos pela tela "Anexar arquivos" (armazenados em
 * data/uploads/) na base principal do projeto (data/employees.json,
 * data/pagamentos.json, data/documentos.json, data/comprovantes/).
 *
 * Isso é útil se você quiser "fixar" os comprovantes que foram sendo
 * anexados ao longo do tempo, deixando-os junto do resto do projeto (por
 * exemplo, antes de subir uma nova versão para o Git/Vercel).
 *
 * Só funciona quando o projeto está rodando SEM Vercel Blob configurado
 * (ou seja, os uploads estão em data/uploads/ no próprio disco). Se você
 * está usando Vercel Blob, os arquivos já são permanentes por lá — não
 * precisa rodar este script.
 *
 * Uso:  npm run reindex
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const uploadsExist = await fs
    .stat(UPLOADS)
    .then(() => true)
    .catch(() => false);

  if (!uploadsExist) {
    console.log("Nenhum upload encontrado em data/uploads — nada para consolidar.");
    return;
  }

  const docsExtra = await readJson(path.join(UPLOADS, "documentos_extra.json"), []);
  const pagsExtra = await readJson(path.join(UPLOADS, "pagamentos_extra.json"), []);
  const employeesOverride = await readJson(path.join(UPLOADS, "employees_override.json"), null);

  const docsBase = await readJson(path.join(DATA, "documentos.json"), []);
  const pagsBase = await readJson(path.join(DATA, "pagamentos.json"), []);

  let movidos = 0;
  for (const doc of docsExtra) {
    if (!doc.origemUpload) continue;
    const srcRel = doc.arquivoRelativo; // ex: "uploads/172xxx-arquivo.pdf" relativo a data/uploads/files
    const src = path.join(UPLOADS, "files", srcRel);
    const destRel = path.join("_anexados", path.basename(srcRel));
    const dest = path.join(DATA, "comprovantes", destRel);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      doc.arquivoRelativo = destRel.split(path.sep).join("/");
      delete doc.origemUpload;
      movidos++;
    } catch (err) {
      console.warn(`Não foi possível copiar ${src}:`, err.message);
    }
  }

  const novosDocs = [...docsBase, ...docsExtra];
  const novosPags = [...pagsBase, ...pagsExtra];

  await fs.writeFile(path.join(DATA, "documentos.json"), JSON.stringify(novosDocs, null, 1));
  await fs.writeFile(path.join(DATA, "pagamentos.json"), JSON.stringify(novosPags, null, 1));

  if (employeesOverride && employeesOverride.length > 0) {
    await fs.writeFile(path.join(DATA, "employees.json"), JSON.stringify(employeesOverride, null, 1));
    console.log(`Planilha de funcionários consolidada (${employeesOverride.length} funcionários).`);
  }

  // limpa os uploads já consolidados
  await fs.rm(UPLOADS, { recursive: true, force: true });

  console.log(`Consolidação concluída: ${docsExtra.length} comprovante(s) e ${pagsExtra.length} registro(s) movidos para a base principal (${movidos} arquivo(s) copiados).`);
  console.log("Dica: confira as pastas 'data/' e depois faça commit se estiver usando Git.");
}

main().catch((err) => {
  console.error("Erro ao consolidar uploads:", err);
  process.exit(1);
});
