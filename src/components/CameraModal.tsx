import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { bitmapToJpeg } from "../lib/media";
import { Button } from "./ui";

/**
 * Cámara dentro de la app. Con la cámara del teléfono, Android a veces cierra el navegador
 * por falta de memoria mientras se saca la foto ("memoria insuficiente") y la foto se pierde.
 */
export function CameraModal({ remaining, onShot, onClose, onFallback }: { remaining: number; onShot: (blob: Blob) => void; onClose: () => void; onFallback: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const [taken, setTaken] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; void video.current.play(); }
      })
      .catch(() => setError("No se pudo abrir la cámara. Revisá que la app tenga permiso de cámara."));
    if (!navigator.mediaDevices?.getUserMedia) setError("Este navegador no permite usar la cámara dentro de la app.");
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  async function shoot() {
    if (!video.current || !ready) return;
    const blob = await bitmapToJpeg(video.current);
    if (!blob) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 150);
    onShot(blob);
    const count = taken + 1;
    setTaken(count);
    if (count >= remaining) onClose();
  }

  return <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Cámara">
    <div className="flex items-center justify-between p-3 text-white">
      <p className="text-sm font-semibold">{taken ? `${taken} foto${taken > 1 ? "s" : ""} tomada${taken > 1 ? "s" : ""}` : "Apuntá al ternero"}</p>
      <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label="Cerrar cámara"><X className="size-5" /></button>
    </div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      {error ? <div className="max-w-xs space-y-4 p-6 text-center text-white">
        <p>{error}</p>
        <Button type="button" variant="secondary" onClick={onFallback} className="w-full">Usar la cámara del teléfono</Button>
      </div> : <video ref={video} playsInline muted onLoadedMetadata={() => setReady(true)} className="max-h-full max-w-full" />}
      {flash ? <div className="absolute inset-0 bg-white/70" /> : null}
    </div>
    {!error ? <div className="flex items-center justify-center gap-6 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <button type="button" onClick={() => void shoot()} disabled={!ready} className="grid size-20 place-items-center rounded-full border-4 border-white bg-white/20 text-white disabled:opacity-40" aria-label="Sacar foto"><Camera className="size-8" /></button>
    </div> : null}
  </div>;
}
