import Fuse from "fuse.js";
import type { Funcionario } from "./types";
import { looksLikeCpf, normalizeName, onlyDigits } from "./normalize";

let fuseInstance: Fuse<Funcionario> | null = null;
let fuseIndexedCount = 0;

function getFuse(funcionarios: Funcionario[]): Fuse<Funcionario> {
  if (fuseInstance && fuseIndexedCount === funcionarios.length) return fuseInstance;
  fuseInstance = new Fuse(funcionarios, {
    keys: [
      { name: "nomeNorm", weight: 1 },
      { name: "nome", weight: 0.6 },
    ],
    threshold: 0.36, // permite pequenos erros de digitação
    distance: 100,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
  fuseIndexedCount = funcionarios.length;
  return fuseInstance;
}

export interface RankedFuncionario {
  funcionario: Funcionario;
  score: number; // 0 = melhor
}

/** Busca inteligente: detecta se a query parece CPF e busca por dígitos; senão, busca fuzzy por nome. */
export function searchFuncionarios(query: string, funcionarios: Funcionario[], limit = 25): RankedFuncionario[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (looksLikeCpf(trimmed)) {
    const digits = onlyDigits(trimmed);
    const matches = funcionarios
      .filter((f) => f.cpf && f.cpf.includes(digits))
      .map((f) => ({
        funcionario: f,
        score: f.cpf.startsWith(digits) ? 0 : 0.3,
      }))
      .sort((a, b) => a.score - b.score || a.funcionario.nome.localeCompare(b.funcionario.nome));
    if (matches.length > 0) return matches.slice(0, limit);
    // se não achou por CPF (ex: começou a digitar um nome com números), continua para busca por nome
  }

  const normQuery = normalizeName(trimmed);
  const fuse = getFuse(funcionarios);
  const results = fuse.search(normQuery || trimmed, { limit });
  return results.map((r) => ({ funcionario: r.item, score: r.score ?? 1 }));
}
