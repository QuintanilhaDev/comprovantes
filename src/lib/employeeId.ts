import type { Funcionario } from "./types";

/** Gera um identificador estável para uso em URLs. Prioriza o CPF (11 dígitos). */
export function employeeId(f: Funcionario): string {
  if (f.cpf && f.cpf.length === 11) return f.cpf;
  return `n-${f.nomeNorm.replace(/\s+/g, "_")}`;
}

export function findEmployeeById(list: Funcionario[], id: string): Funcionario | null {
  const found = list.find((f) => employeeId(f) === id);
  return found || null;
}
