import { NextRequest, NextResponse } from "next/server";
import { addDocumentos, addPagamentos, getFuncionarios } from "@/lib/data";
import { parseReceiptPdf } from "@/lib/pdfExtract";
import { saveUploadedFile } from "@/lib/storage";
import { normalizeCpf } from "@/lib/normalize";
import type { Documento, Pagamento, TipoBeneficio } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const novosDocumentos: Documento[] = [];
  const novosPagamentos: Pagamento[] = [];
  const resultados: Array<{
    arquivo: string;
    status: "ok" | "erro";
    detalhe?: string;
    nomeDetectado?: string | null;
    tipo?: TipoBeneficio;
    funcionarioEncontrado?: boolean;
  }> = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      resultados.push({ arquivo: file.name, status: "erro", detalhe: "Não é um arquivo PDF." });
      continue;
    }
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const parsed = await parseReceiptPdf(file.name, bytes, tipoManual);

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
    await addPagamentos(novosPagamentos);
  }

  return NextResponse.json({ resultados });
}
