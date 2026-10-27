import { useEffect, useRef, useState } from "react";

export const REPORTS_BUCKET = "simple-guachera-avisos";
export const MAX_PHOTOS = 4;
export const MAX_AUDIO_SECONDS = 120;

/**
 * Achica la foto (lado menor ~1600 px, JPEG) para que suba rápido con poca señal.
 * Se decodifica ya reducida: abrir entera una foto de 50 MP puede agotar la memoria del celular.
 */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { resizeWidth: maxSide, resizeQuality: "medium" });
    const blob = await bitmapToJpeg(bitmap, maxSide, quality);
    return blob ?? file;
  } catch {
    return file; // formatos que el navegador no puede leer (ej. HEIC) se suben tal cual
  }
}

/** Dibuja una imagen o un cuadro de video en un lienzo de a lo sumo maxSide de lado y lo pasa a JPEG. */
export async function bitmapToJpeg(source: ImageBitmap | HTMLVideoElement, maxSide = 1600, quality = 0.8) {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (!(source instanceof HTMLVideoElement)) source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  canvas.width = canvas.height = 0; // libera la memoria del lienzo enseguida
  return blob;
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
