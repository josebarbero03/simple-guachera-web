import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "https://njolhcyjyblkqohbjayj.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_mK6GlrefF83FfdcFzGCXuQ_C1pvq-BG";

export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export function errorText(error: unknown, fallback = "Ocurrió un error") {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  if (/simple_guachera_calves_active_tag|duplicate key/i.test(message)) return "Ya hay un ternero activo con esa caravana en este establecimiento.";
  if (/Failed to fetch|NetworkError/i.test(message)) return "Sin conexión. Revisá la señal e intentá de nuevo.";
  if (/relation .* does not exist|Could not find the table/i.test(message)) return "Falta crear las tablas en Supabase (ver supabase/migrations).";
  return message || fallback;
}
