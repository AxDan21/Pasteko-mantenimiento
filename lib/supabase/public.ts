import { createClient as createSupabase } from "@supabase/supabase-js";

/** Cliente sin sesión para la página pública. Permite caché (ISR) en Vercel. */
export function publicClient() {
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
