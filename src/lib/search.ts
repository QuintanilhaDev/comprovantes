import type { Funcionario } from "./types";
import { looksLikeCpf, normalizeName, onlyDigits } from "./normalize";
import { compararNomes } from "./nameMatch";

export interface RankedFuncionario {
  funcionario: Funcionario;
  score: number; // 0 = melhor (mantém a mesma convenção usada no resto do código)
}

const LIMIAR_MINIMO = 0.55;

/** Busca inteligente: detecta se a query parece CPF e busca por dígitos; senão, busca por nome (palavra a palavra). */
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
  if (!normQuery) return [];

  const ranked: RankedFuncionario[] = [];
  for (const f of funcionarios) {
    const similaridade = compararNomes(normQuery, f.nomeNorm);
    if (similaridade >= LIMIAR_MINIMO) {
      ranked.push({ funcionario: f, score: 1 - similaridade });
    }
  }

  ranked.sort((a, b) => a.score - b.score || a.funcionario.nome.localeCompare(b.funcionario.nome));
  return ranked.slice(0, limit);
}
