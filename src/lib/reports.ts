import { REPORTS_BUCKET, baseMime, extensionFor } from "./media";
import { errorText, supabase } from "./supabase";
import type { Attachment } from "./types";

/** Sube fotos y audio a la carpeta privada del establecimiento y crea el aviso. Devuelve un mensaje de error o null. */
export async function sendReport({ farmId, calfId, notes, urgent, photos, audio }: { farmId: string; calfId: string | null; notes: string; urgent: boolean; photos: Blob[]; audio: Blob | null }) {
  if (!navigator.onLine) return "Sin señal: el aviso necesita conexión para subir fotos y audio.";
  const id = crypto.randomUUID();
  const files: { blob: Blob; kind: Attachment["kind"]; name: string }[] = [
    ...photos.map((blob, i) => ({ blob, kind: "foto" as const, name: `foto-${i + 1}` })),
    ...(audio ? [{ blob: audio, kind: "audio" as const, name: "audio" }] : []),
  ];
  const attachments: Attachment[] = [];
  for (const f of files) {
    const mime = baseMime(f.blob.type || (f.kind === "foto" ? "image/jpeg" : "audio/webm"));
    const path = `${farmId}/${id}/${f.name}.${extensionFor(mime)}`;
    const { error } = await supabase.storage.from(REPORTS_BUCKET).upload(path, f.blob, { contentType: mime, upsert: false });
    if (error) { await removeAttachments(attachments); return errorText(error, "No se pudo subir un archivo"); }
    attachments.push({ path, kind: f.kind, mime });
  }
  const { error } = await supabase.from("simple_guachera_reports").insert({ id, farm_id: farmId, calf_id: calfId, notes: notes.trim(), urgent, attachments });
  if (error) { await removeAttachments(attachments); return errorText(error, "No se pudo enviar el aviso"); }
  return null;
}

export async function removeAttachments(items: Attachment[]) {
  if (items.length) await supabase.storage.from(REPORTS_BUCKET).remove(items.map((a) => a.path));
}
