import { useEffect, useRef, useState } from "react";

export const REPORTS_BUCKET = "simple-guachera-avisos";
export const MAX_PHOTOS = 4;
export const MAX_AUDIO_SECONDS = 120;

/** Achica la foto (lado mayor 1600 px, JPEG) para que suba rápido con poca señal. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file; // formatos que el navegador no puede leer (ej. HEIC) se suben tal cual
  }
}

/** Tipo de archivo sin parámetros (ej. "audio/webm;codecs=opus" → "audio/webm"). */
export const baseMime = (type: string) => type.split(";")[0].trim() || "application/octet-stream";

export function extensionFor(mime: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav", "audio/x-m4a": "m4a" } as Record<string, string>)[baseMime(mime)] ?? "bin";
}

/** Grabación de audio con el micrófono del celular. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const supported = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

  const clearTimer = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; };

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setBlob(new Blob(chunks, { type: baseMime(rec.mimeType || mime || "audio/webm") }));
        setRecording(false);
        clearTimer();
      };
      recorder.current = rec;
      rec.start();
      setBlob(null);
      setSeconds(0);
      setRecording(true);
      const started = Date.now();
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        setSeconds(s);
        if (s >= MAX_AUDIO_SECONDS) rec.state === "recording" && rec.stop();
      }, 250);
    } catch {
      setError("No se pudo usar el micrófono. Revisá que la app tenga permiso.");
    }
  }

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const reset = () => { setBlob(null); setSeconds(0); };
  useEffect(() => () => { clearTimer(); if (recorder.current?.state === "recording") recorder.current.stop(); }, []);

  return { supported, recording, seconds, blob, error, start, stop, reset };
}
