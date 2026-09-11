import { readJsonLocal, readMutableJson } from "./storage";
import type { Documento, Funcionario, Pagamento } from "./types";
import { normalizeCpf, normalizeName } from "./normalize";

interface Cache {
  funcionarios: Funcionario[] | null;
  pagamentos: Pagamento[] | null;
  documentos: Documento[] | null;
  loadedAt: number;
}

const cache: Cache = { funcionarios: null, pagamentos: null, documentos: null, loadedAt: 0 };
const CACHE_TTL_MS = 30_000; // evita reler storage remoto a cada requisição, mas atualiza rápido após upload

function isFresh() {
  return Date.now() - cache.loadedAt < CACHE_TTL_MS;
}

export function invalidateCache() {
  cache.funcionarios = null;
  cache.pagamentos = null;
  cache.documentos = null;
  cache.loadedAt = 0;
}

export async function getFuncionarios(): Promise<Funcionario[]> {
  if (cache.funcionarios && isFresh()) return cache.funcionarios;

  const baseline = await readJsonLocal<Funcionario[]>("employees.json", []);
  const override = await readMutableJson<Funcionario[] | null>("employees_override", null);

  const list = override && override.length > 0 ? override : baseline;

  // garante nomeNorm/cpf normalizados mesmo se vierem de upload manual
  const normalized = list.map((f) => ({
    ...f,
    cpf: normalizeCpf(f.cpf),
    nomeNorm: f.nomeNorm || normalizeName(f.nome),
  }));

  cache.funcionarios = normalized;
  cache.loadedAt = Date.now();
  return normalized;
}

export async function getPagamentos(): Promise<Pagamento[]> {
  if (cache.pagamentos && isFresh()) return cache.pagamentos;

  const baseline = await readJsonLocal<Pagamento[]>("pagamentos.json", []);
  const extra = await readMutableJson<Pagamento[]>("pagamentos_extra", []);

  const list = [...baseline, ...extra];
  cache.pagamentos = list;
  return list;
}

export async function getDocumentos(): Promise<Documento[]> {
  if (cache.documentos && isFresh()) return cache.documentos;

  const baseline = await readJsonLocal<Documento[]>("documentos.json", []);
  const extra = await readMutableJson<Documento[]>("documentos_extra", []);

  const list = [...baseline, ...extra];
  cache.documentos = list;
  return list;
}

export async function addDocumentos(novos: Documento[]) {
  const extra = await readMutableJson<Documento[]>("documentos_extra", []);
  const merged = [...extra, ...novos];
  const { writeMutableJson } = await import("./storage");
  await writeMutableJson("documentos_extra", merged);
  invalidateCache();
}

export async function addPagamentos(novos: Pagamento[]) {
  const extra = await readMutableJson<Pagamento[]>("pagamentos_extra", []);
  const merged = [...extra, ...novos];
  const { writeMutableJson } = await import("./storage");
  await writeMutableJson("pagamentos_extra", merged);
  invalidateCache();
}

export async function replaceFuncionarios(novos: Funcionario[]) {
  const { writeMutableJson } = await import("./storage");
  await writeMutableJson("employees_override", novos);
  invalidateCache();
}
