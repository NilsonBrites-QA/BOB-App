/**
 * Validação de senha — regra única usada em todos os pontos onde uma senha
 * pode ser definida (criação de usuário, troca de senha, reset pelo admin).
 *
 * Política atual (mínima razoável, sem ser hostil):
 *   - 10+ caracteres
 *   - Pelo menos 1 letra
 *   - Pelo menos 1 número
 *   - Não pode ser uma das 20 senhas mais óbvias
 *
 * Não exigimos símbolos pra não bloquear gerenciadores de senha simples.
 * Não exigimos maiúscula/minúscula porque adiciona fricção sem ganho real
 * de segurança em senhas longas.
 */

const TRIVIAL_PASSWORDS = new Set<string>([
  "12345678",
  "123456789",
  "1234567890",
  "0000000000",
  "1111111111",
  "qwerty1234",
  "asdfghjkl1",
  "password12",
  "password123",
  "senha12345",
  "senha123456",
  "admin12345",
  "admin123456",
  "abcdefghij",
  "letmein123",
  "welcome123",
  "iloveyou12",
  "monkey1234",
  "dragon1234",
  "master1234",
]);

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: string };

export function validateStrongPassword(password: string): PasswordValidation {
  if (typeof password !== "string") {
    return { ok: false, reason: "Senha inválida." };
  }
  if (password.length < 10) {
    return { ok: false, reason: "A senha precisa ter pelo menos 10 caracteres." };
  }
  if (password.length > 200) {
    return { ok: false, reason: "Senha muito longa (máx 200 caracteres)." };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, reason: "A senha precisa ter pelo menos uma letra." };
  }
  if (!/\d/.test(password)) {
    return { ok: false, reason: "A senha precisa ter pelo menos um número." };
  }
  if (TRIVIAL_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: "Esta senha é muito comum. Escolha outra." };
  }
  return { ok: true };
}

/**
 * Texto curto explicando a política — para mostrar em formulários.
 */
export const PASSWORD_POLICY_HINT =
  "Mínimo 10 caracteres, com pelo menos 1 letra e 1 número.";
