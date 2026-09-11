import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

/**
 * Abstração de armazenamento.
 *
 * - Sem BLOB_READ_WRITE_TOKEN configurado: usa o disco local (pasta /data).
 *   Funciona perfeitamente com `npm run dev` / `npm start` na sua máquina.
 * - Com BLOB_READ_WRITE_TOKEN configurado (Vercel Blob): os uploads feitos
 *   pela tela "Anexar arquivos" passam a ser permanentes também quando o
 *   projeto está hospedado no Vercel (cujo sistema de arquivos é temporário).
 *
 * Os dados que já vêm prontos com o projeto (planilha inicial + comprovantes
 * de agosto/setembro) sempre são lidos do disco, pois fazem parte do próprio
 * código-fonte enviado ao Vercel.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export function dataDir() {
  return DATA_DIR;
}

export async function readJsonLocal<T>(relPath: string, fallback: T): Promise<T> {
  try {
    const full = path.join(DATA_DIR, relPath);
    const raw = await fs.readFile(full, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readJsonLocalSync<T>(relPath: string, fallback: T): T {
  try {
    const full = path.join(DATA_DIR, relPath);
    const raw = fssync.readFileSync(full, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function getBlobClient() {
  // Import dinâmico: assim o pacote @vercel/blob (opcional) só é necessário
  // quando o token está configurado.
  const mod = await import("@vercel/blob");
  return mod;
}

const BLOB_PREFIX = "comprovantes-tre";

/** Lê um JSON "mutável" (ex.: uploads acumulados). Combina com o baseline local quando aplicável. */
export async function readMutableJson<T>(key: string, fallback: T): Promise<T> {
  if (USE_BLOB) {
    try {
      const { list } = await getBlobClient();
      const { blobs } = await list({ prefix: `${BLOB_PREFIX}/${key}` });
      if (blobs.length === 0) return fallback;
      const latest = blobs.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))[0];
      const res = await fetch(latest.url, { cache: "no-store" });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch {
      return fallback;
    }
  }
  return readJsonLocal(`uploads/${key}.json`, fallback);
}

export async function writeMutableJson<T>(key: string, value: T): Promise<void> {
  if (USE_BLOB) {
    const { put } = await getBlobClient();
    await put(`${BLOB_PREFIX}/${key}.json`, JSON.stringify(value), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  const full = path.join(DATA_DIR, "uploads", `${key}.json`);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, JSON.stringify(value, null, 1), "utf-8");
}

export async function saveUploadedFile(relPath: string, bytes: Buffer, contentType: string): Promise<string> {
  if (USE_BLOB) {
    const { put } = await getBlobClient();
    const blob = await put(`${BLOB_PREFIX}/files/${relPath}`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }
  const full = path.join(DATA_DIR, "uploads", "files", relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  return `local:${relPath}`;
}

export async function readFileBytes(kind: "baseline" | "upload", relPath: string): Promise<Buffer | null> {
  if (kind === "baseline") {
    try {
      const full = path.join(DATA_DIR, "comprovantes", relPath);
      return await fs.readFile(full);
    } catch {
      return null;
    }
  }
  // upload
  if (USE_BLOB) {
    try {
      const { list } = await getBlobClient();
      const { blobs } = await list({ prefix: `${BLOB_PREFIX}/files/${relPath}` });
      if (blobs.length === 0) return null;
      const res = await fetch(blobs[0].url, { cache: "no-store" });
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch {
      return null;
    }
  }
  try {
    const full = path.join(DATA_DIR, "uploads", "files", relPath);
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export function isUsingBlob() {
  return USE_BLOB;
}
