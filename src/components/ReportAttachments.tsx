import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { REPORTS_BUCKET } from "../lib/media";
import { supabase } from "../lib/supabase";
import type { Attachment } from "../lib/types";

/** Muestra las fotos (tocables para ver en grande) y los audios de un aviso. */
export function ReportAttachments({ items }: { items: Attachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!items.length) return;
    void supabase.storage.from(REPORTS_BUCKET).createSignedUrls(items.map((a) => a.path), 60 * 60).then(({ data, error }) => {
      if (error || !data) { setFailed(true); return; }
      setUrls(Object.fromEntries(data.flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : []))));
    });
  }, [items]);

  if (!items.length) return null;
  if (failed) return <p className="flex items-center gap-2 text-sm text-slate-500"><ImageOff className="size-4" />No se pudieron cargar los archivos.</p>;
  const photos = items.filter((a) => a.kind === "foto");
  const audios = items.filter((a) => a.kind === "audio");
  return <div className="space-y-2">
    {photos.length ? <div className="flex flex-wrap gap-2">{photos.map((a) => urls[a.path]
      ? <a key={a.path} href={urls[a.path]} target="_blank" rel="noreferrer" title="Ver foto completa"><img src={urls[a.path]} alt="Foto del aviso" className="size-24 rounded-xl border border-[#dce5e1] object-cover sm:size-28" /></a>
      : <span key={a.path} className="size-24 animate-pulse rounded-xl bg-slate-100 sm:size-28" />)}</div> : null}
    {audios.map((a) => urls[a.path] ? <audio key={a.path} controls preload="none" src={urls[a.path]} className="w-full max-w-sm" /> : <span key={a.path} className="block h-10 max-w-sm animate-pulse rounded-full bg-slate-100" />)}
  </div>;
}
