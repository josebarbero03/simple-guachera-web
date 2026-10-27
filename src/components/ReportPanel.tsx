import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, CheckCircle2, Clock, ImagePlus, Mic, Send, Square, Trash2, X } from "lucide-react";
import { MAX_AUDIO_SECONDS, MAX_PHOTOS, REPORTS_BUCKET, baseMime, compressImage, extensionFor, useRecorder } from "../lib/media";
import { errorText, supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/treatments";
import type { Attachment, Farm, Report } from "../lib/types";
import { CameraModal } from "./CameraModal";
import { ReportAttachments } from "./ReportAttachments";
import { Button, Card, Empty, Field, Input, Textarea, toast } from "./ui";

type Photo = { blob: Blob; url: string };
type ReportRow = Report & { calf: { tag: string } | null };

/** Operario: avisa lo que ve (texto, fotos y audio) para que el productor o veterinario lo diagnostique. */
export function ReportPanel({ farm, userId }: { farm: Farm; userId: string }) {
  const [tags, setTags] = useState<{ id: string; tag: string }[]>([]);
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<ReportRow[] | null>(null);
  const audio = useRecorder();
  const audioUrl = useObjectUrl(audio.blob);
  const fileInput = useRef<HTMLInputElement>(null);
  const phoneCamera = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("simple_guachera_reports").select("*, calf:simple_guachera_calves(tag)").eq("farm_id", farm.id).eq("created_by", userId).order("created_at", { ascending: false }).limit(20);
    if (error) { toast.error(errorText(error, "No se pudieron cargar tus avisos")); setMine((m) => m ?? []); return; }
    setMine(data as ReportRow[]);
  }, [farm.id, userId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void supabase.from("simple_guachera_calves").select("id,tag").eq("farm_id", farm.id).eq("active", true).order("tag").then(({ data }) => setTags((data ?? []) as { id: string; tag: string }[]));
  }, [farm.id]);
  // Liberar las vistas previas solo al salir de la pantalla (no en cada cambio, o se rompen las miniaturas).
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast.error(`Máximo ${MAX_PHOTOS} fotos por aviso.`);
    // De a una, para no tener varias fotos grandes abiertas a la vez en memoria.
    for (const f of files.slice(0, room)) {
      const blob = await compressImage(f);
      setPhotos((list) => [...list, { blob, url: URL.createObjectURL(blob) }]);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (audio.recording) { toast.error("Terminá la grabación antes de enviar."); return; }
    const calf = tag.trim() ? tags.find((t) => t.tag.toLowerCase() === tag.trim().toLowerCase()) : null;
    if (tag.trim() && !calf) { toast.error(`No hay un ternero activo con caravana ${tag.trim()}.`); return; }
    if (!notes.trim() && !photos.length && !audio.blob) { toast.error("Contá qué pasa, sacá una foto o grabá un audio."); return; }
    if (!navigator.onLine) { toast.error("Sin señal: el aviso necesita conexión para subir fotos y audio."); return; }
    setSending(true);
    const id = crypto.randomUUID();
    const files: { blob: Blob; kind: Attachment["kind"]; name: string }[] = [
      ...photos.map((p, i) => ({ blob: p.blob, kind: "foto" as const, name: `foto-${i + 1}` })),
      ...(audio.blob ? [{ blob: audio.blob, kind: "audio" as const, name: "audio" }] : []),
    ];
    const attachments: Attachment[] = [];
    for (const f of files) {
      const mime = baseMime(f.blob.type || (f.kind === "foto" ? "image/jpeg" : "audio/webm"));
      const path = `${farm.id}/${id}/${f.name}.${extensionFor(mime)}`;
      const { error } = await supabase.storage.from(REPORTS_BUCKET).upload(path, f.blob, { contentType: mime, upsert: false });
      if (error) { setSending(false); toast.error(errorText(error, "No se pudo subir un archivo")); await removeUploaded(attachments); return; }
      attachments.push({ path, kind: f.kind, mime });
    }
    const { error } = await supabase.from("simple_guachera_reports").insert({ id, farm_id: farm.id, calf_id: calf?.id ?? null, notes: notes.trim(), urgent, attachments });
    setSending(false);
    if (error) { toast.error(errorText(error, "No se pudo enviar el aviso")); await removeUploaded(attachments); return; }
    toast.ok(urgent ? "Aviso urgente enviado" : "Aviso enviado");
    setTag(""); setNotes(""); setUrgent(false); setPhotos([]); audio.reset();
    await load();
  }

  async function remove(r: ReportRow) {
    if (!window.confirm("¿Borrar este aviso?")) return;
    const { error } = await supabase.from("simple_guachera_reports").delete().eq("id", r.id);
    if (error) { toast.error(errorText(error, "No se pudo borrar")); return; }
    await removeUploaded(r.attachments);
    await load();
  }

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-black">Avisar</h1><p className="text-sm text-slate-600">Contá lo que ves con fotos o un audio. El productor o veterinario lo revisa y te deja el diagnóstico.</p></div>

    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Ternero" hint="Opcional"><Input list="report-tags" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Caravana" /></Field>
          <Field label="¿Qué ves?"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ej. diarrea con sangre, no quiere tomar la leche" /></Field>
        </div>
        <datalist id="report-tags">{tags.map((t) => <option key={t.id} value={t.tag} />)}</datalist>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setCamera(true)} disabled={photos.length >= MAX_PHOTOS}><Camera />Sacar foto</Button>
            <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()} disabled={photos.length >= MAX_PHOTOS}><ImagePlus />Galería</Button>
            {audio.supported ? (audio.recording
              ? <Button type="button" variant="danger" onClick={audio.stop}><Square />Detener · {formatSeconds(audio.seconds)}</Button>
              : <Button type="button" variant="secondary" onClick={() => void audio.start()}><Mic />{audio.blob ? "Grabar de nuevo" : "Grabar audio"}</Button>) : null}
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple onChange={(e) => void addPhotos(e)} className="hidden" aria-label="Agregar fotos" />
          <input ref={phoneCamera} type="file" accept="image/*" capture="environment" onChange={(e) => void addPhotos(e)} className="hidden" aria-label="Cámara del teléfono" />
          {camera ? <CameraModal remaining={MAX_PHOTOS - photos.length} onClose={() => setCamera(false)} onFallback={() => { setCamera(false); phoneCamera.current?.click(); }}
            onShot={(blob) => setPhotos((list) => list.length >= MAX_PHOTOS ? list : [...list, { blob, url: URL.createObjectURL(blob) }])} /> : null}
          {audio.error ? <p className="text-sm text-rose-600">{audio.error}</p> : null}
          {audio.recording ? <p className="flex items-center gap-2 text-sm font-semibold text-rose-600"><span className="size-2.5 animate-pulse rounded-full bg-rose-600" />Grabando… (máximo {MAX_AUDIO_SECONDS / 60} minutos)</p> : null}
          {photos.length ? <div className="flex flex-wrap gap-2">{photos.map((p, i) => <div key={p.url} className="relative">
            <img src={p.url} alt={`Foto ${i + 1}`} className="size-24 rounded-xl object-cover" />
            <button type="button" onClick={() => { URL.revokeObjectURL(p.url); setPhotos((list) => list.filter((x) => x !== p)); }} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-white shadow" aria-label={`Quitar foto ${i + 1}`}><X className="size-4" /></button>
          </div>)}</div> : null}
          {audioUrl ? <div className="flex items-center gap-2"><audio controls src={audioUrl} className="w-full max-w-sm" /><button type="button" onClick={audio.reset} className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Borrar audio"><Trash2 className="size-4" /></button></div> : null}
        </div>

        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-sm font-bold ${urgent ? "border-rose-500 bg-rose-50 text-rose-700" : "border-transparent bg-slate-100 text-slate-600"}`}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="size-4 accent-rose-600" />Es urgente (ternero caído, no se levanta, respira mal)
        </label>
        <Button type="submit" loading={sending} className="h-12 w-full">{!sending ? <Send /> : null}{sending ? "Enviando…" : "Enviar aviso"}</Button>
      </form>
    </Card>

    <h2 className="text-lg font-black">Mis avisos</h2>
    {mine === null ? <p className="text-center text-slate-500">Cargando…</p>
      : !mine.length ? <Empty icon={<Send />} title="Todavía no enviaste avisos" text="Cuando el productor o veterinario los revise, vas a ver el diagnóstico acá." />
      : <ul className="space-y-2">{mine.map((r) => <li key={r.id} className={`space-y-2 rounded-2xl border bg-white p-3 ${r.urgent && r.status === "Pendiente" ? "border-rose-300" : "border-[#dce5e1]"}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-black">{r.calf ? `Ternero ${r.calf.tag}` : "Aviso general"}{r.urgent ? <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-black uppercase text-white">Urgente</span> : null}</p>
            <p className="text-xs text-slate-500">{formatDateTime(r.created_at)}</p>
          </div>
          {r.status === "Revisado" ? <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-xs font-bold text-brand-dark"><CheckCircle2 className="size-3.5" />Revisado</span>
            : <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900"><Clock className="size-3.5" />Pendiente</span>}
        </div>
        {r.notes ? <p className="whitespace-pre-line text-sm text-slate-700">{r.notes}</p> : null}
        <ReportAttachments items={r.attachments} />
        {r.status === "Revisado" ? <div className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark"><strong>Diagnóstico{r.diagnosed_by_name ? ` de ${r.diagnosed_by_name}` : ""}:</strong> {r.diagnosis || "Revisado, sin comentarios."}</div>
          : <button onClick={() => void remove(r)} className="text-sm font-semibold text-slate-500 hover:text-rose-600">Borrar aviso</button>}
      </li>)}</ul>}
  </div>;
}

async function removeUploaded(items: Attachment[]) {
  if (items.length) await supabase.storage.from(REPORTS_BUCKET).remove(items.map((a) => a.path));
}

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
