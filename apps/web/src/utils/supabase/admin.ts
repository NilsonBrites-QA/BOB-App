/**
 * Cliente Supabase com SERVICE_ROLE — uso restrito a server actions
 * que precisam de privilégios administrativos (criar usuários com
 * senha, deletar contas, listar todos os usuários, etc.).
 *
 * NUNCA importe este módulo em código que rode no client. O bundler
 * deveria barrar (cookies/headers só rodam no server), mas mantemos
 * a checagem de env no topo para falha rápida.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurado.");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurado. Adicione ao Vercel para criar usuários via admin.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
