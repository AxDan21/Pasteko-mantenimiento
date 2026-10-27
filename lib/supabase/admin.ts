import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";

/**
 * Cliente con la llave de servicio. SOLO en el servidor y solo después de
 * validar que quien llama es administrador (alta de técnicos).
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
