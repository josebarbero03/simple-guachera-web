import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { parseBulkCalves, parseCategories, parseColostrum, parseExits, parseTreatments, parseWeaning, parseWeights, type CalfRef, type CategoryRow, type ProtocolRef, type TreatmentRow } from "../lib/bulk";
import { CATEGORY_NAMES, formatDate, formatKg, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import type { Farm } from "../lib/types";
import { Button, Card, Textarea, toast } from "./ui";

export type BulkKind = "terneros" | "pesadas" | "tratamientos" | "categorias" | "calostrado" | "destete" | "bajas";

const KINDS: { id: BulkKind; label: string; columns: string[]; example: string[]; help: string }[] = [
  { id: "terneros", label: "Terneros", columns: ["Caravana", "Fecha de nacimiento", "Sexo (H/M)", "Peso al nacer", "Ubicación"], example: ["2418;15/10/2026;H;38;Estaca A-06", "2419;16/10/2026;M;41;Estaca A-07"], help: "Solo caravana y fecha son obligatorias." },
  { id: "pesadas", label: "Pesadas", columns: ["Caravana", "Fecha", "Peso (kg)"], example: ["2418;27/10/2026;52,5", "2419;27/10/2026;49"], help: "Si ya hay una pesada ese día para el ternero, se reemplaza." },
  { id: "tratamientos", label: "Tratamientos", columns: ["Caravana", "Protocolo", "Fecha de inicio", "Hora (opcional)", "Gravedad (opcional)", "Diagnóstico (opcional)"], example: ["2418;Diarrea;27/10/2026;08:00;Moderado;Diarrea amarilla", "2419;Neumonía;27/10/2026;;Grave;"], help: "El protocolo se busca por nombre exacto. Hora por defecto 08:00, gravedad Leve. Se generan todas las dosis." },
  { id: "categorias", label: "Cambio de categoría", columns: ["Caravana", "Categoría (Guachera, Acostumbramiento, Recría o Automática)", "Fecha (opcional)", "Observaciones (opcional)"], example: ["2418;Acostumbramiento;27/10/2026;Destete lote 3", "2419;Recría;;"], help: "Sin fecha se toma la de hoy. “Automática” vuelve a la categoría según la edad." },
  { id: "calostrado", label: "Calostrado / sangre", columns: ["Caravana", "Litros de calostro", "Brix calostro %", "Horas de vida", "Proteína total g/dL", "Brix suero %"], example: ["2418;4;24;1;6,3;", "2419;3;;2;;8,7"], help: "Las columnas vacías no se modifican." },
  { id: "destete", label: "Destete", columns: ["Caravana", "Fecha de destete", "Peso (opcional)"], example: ["2418;27/10/2026;82", "2419;27/10/2026;"], help: "" },
  { id: "bajas", label: "Bajas / mortandad", columns: ["Caravana", "Fecha", "Motivo (Muerte, Venta, Traslado, Otro)", "Causa"], example: ["2418;26/10/2026;Muerte;Neumonía", "2419;26/10/2026;Venta;"], help: "Para muertes, la causa alimenta los indicadores." },
];

type Preview = { line: number; raw: string; ok: boolean; text: string };

export function BulkImport({ farm, fixed, onDone }: { farm: Farm; fixed?: BulkKind; onDone?: () => Promise<void> }) {
  const [kind, setKind] = useState<BulkKind>(fixed ?? "pesadas");
  const [text, setText] = useState("");
  const [calves, setCalves] = useState<CalfRef[]>([]);
  const [protocols, setProtocols] = useState<ProtocolRef[]>([]);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const def = KINDS.find((k) => k.id === kind)!;

  const loadRefs = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from("simple_guachera_calves").select("id,tag,birth_date,active").eq("farm_id", farm.id),
      supabase.from("simple_guachera_protocols").select("id,name,kind,active").eq("farm_id", farm.id),
    ]);
    setCalves((c.data ?? []) as CalfRef[]);
    setProtocols((p.data ?? []) as ProtocolRef[]);
  }, [farm.id]);
  useEffect(() => { void loadRefs(); }, [loadRefs]);

  const on = today();
  const parsed = useMemo(() => {
    switch (kind) {
      case "terneros": return parseBulkCalves(text, calves.filter((c) => c.active).map((c) => c.tag), on).map((r) => ({ ...r, summary: r.value ? `${r.value.tag} · ${formatDate(r.value.birth_date)} · ${r.value.sex}${r.value.birth_weight ? ` · ${formatKg(r.value.birth_weight)}` : ""}${r.value.location ? ` · ${r.value.location}` : ""}` : "" }));
      case "pesadas": return parseWeights(text, calves, on);
      case "tratamientos": return parseTreatments(text, calves, protocols, on);
      case "categorias": return parseCategories(text, calves, CATEGORY_NAMES, on);
      case "calostrado": return parseColostrum(text, calves);
      case "destete": return parseWeaning(text, calves, on);
      case "bajas": return parseExits(text, calves, on);
    }
  }, [kind, text, calves, protocols, on]);
  const preview: Preview[] = parsed.map((r) => ({ line: r.line, raw: r.raw, ok: !!r.value, text: r.value ? r.summary : r.error ?? "" }));
  const valid = parsed.filter((r) => r.value);

  function template() {
    const csv = "﻿" + [def.columns.join(";"), ...def.example].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `plantilla-${kind}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) { toast.error("Subí un archivo .csv. En Excel: Archivo → Guardar como → CSV."); return; }
    setText(await file.text());
  }

  async function save() {
    if (!valid.length) return;
    setSaving(true);
    setReport(null);
    let ok = 0;
    const failures: string[] = [];
    const run = async (label: string, op: PromiseLike<{ error: unknown }>, count = 1) => {
      const { error } = await op;
      if (error) failures.push(`${label}: ${errorText(error)}`); else ok += count;
    };
    const values = valid.map((r) => r.value!);
    if (kind === "terneros") await run("Terneros", supabase.from("simple_guachera_calves").insert((values as { tag: string }[]).map((v) => ({ ...v, farm_id: farm.id }))), values.length);
    else if (kind === "pesadas") await run("Pesadas", supabase.from("simple_guachera_weights").upsert((values as object[]).map((v) => ({ ...v, farm_id: farm.id })), { onConflict: "calf_id,weighed_at" }), values.length);
    else if (kind === "tratamientos") {
      // Un llamado por grupo de terneros con el mismo protocolo, inicio, gravedad y diagnóstico.
      const groups = new Map<string, { row: TreatmentRow; calves: string[] }>();
      for (const v of values as TreatmentRow[]) {
        const key = `${v.protocol_id}|${v.start_at}|${v.severity}|${v.diagnosis}`;
        groups.set(key, { row: v, calves: [...(groups.get(key)?.calves ?? []), v.calf_id] });
      }
      for (const { row, calves: ids } of groups.values()) {
        await run(protocols.find((p) => p.id === row.protocol_id)?.name ?? "Tratamiento", supabase.rpc("simple_guachera_start_treatment", { target_farm: farm.id, calf_ids: ids, protocol: row.protocol_id, start_at: row.start_at, diagnosis: row.diagnosis, treatment_notes: "", severity: row.severity }), ids.length);
      }
    } else if (kind === "categorias") {
      // Un llamado por grupo con la misma categoría, fecha y observación.
      const groups = new Map<string, { row: CategoryRow; calves: string[] }>();
      for (const v of values as CategoryRow[]) {
        const key = `${v.category}|${v.moved_on}|${v.notes}`;
        groups.set(key, { row: v, calves: [...(groups.get(key)?.calves ?? []), v.calf_id] });
      }
      for (const { row, calves: ids } of groups.values()) {
        await run(row.category || "Automática", supabase.rpc("simple_guachera_change_category", { calf_ids: ids, new_category: row.category, moved_on: row.moved_on, move_notes: row.notes }), ids.length);
      }
    } else {
      for (const r of valid) {
        const { id, ...rest } = r.value as { id: string } & Record<string, unknown>;
        const patch = kind === "calostrado" ? Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null)) : kind === "bajas" ? { ...rest, active: false } : rest;
        await run(r.summary.split(" · ")[0], supabase.from("simple_guachera_calves").update(patch).eq("id", id));
      }
    }
    setSaving(false);
    if (ok) toast.ok(`${ok} ${ok === 1 ? "registro cargado" : "registros cargados"}`);
    if (failures.length) { toast.error(`${failures.length} con error`); setReport(failures.join("\n")); }
    else setText("");
    await loadRefs();
    if (ok && onDone) await onDone();
  }

  return <div className="space-y-4">
    {!fixed ? <div><h1 className="text-2xl font-black">Carga masiva</h1><p className="text-sm text-slate-600">Pegá desde Excel o subí un CSV · {farm.name}</p></div> : null}
    {!fixed ? <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {KINDS.map((k) => <button key={k.id} onClick={() => { setKind(k.id); setReport(null); }} className={`shrink-0 rounded-full px-3 py-2 text-sm font-bold ${kind === k.id ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{k.label}</button>)}
    </div> : null}

    <Card className="space-y-3">
      <div className="text-sm text-slate-600">
        <p>Columnas en este orden:</p>
        <ol className="mt-1 flex flex-wrap gap-1.5">{def.columns.map((c, i) => <li key={c} className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-800">{i + 1}. {c}</li>)}</ol>
        {def.help ? <p className="mt-2">{def.help}</p> : null}
        <p className="mt-1">Si la primera fila es un encabezado que empieza con “Caravana”, se ignora.</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <button type="button" onClick={template} className="inline-flex items-center gap-2 text-sm font-bold text-brand"><Download className="size-4" />Descargar plantilla</button>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-brand"><FileUp className="size-4" />Subir archivo CSV<input type="file" accept=".csv,.txt,.tsv,text/csv" onChange={(e) => void readFile(e)} className="hidden" /></label>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={def.example.join("\n")} className="font-mono text-sm" aria-label="Datos a cargar" />
    </Card>

    {preview.length ? <div>
      <p className="mb-2 flex flex-wrap gap-x-4 text-sm font-bold"><span className="text-brand-dark">{valid.length} listos</span>{preview.length - valid.length ? <span className="text-rose-600">{preview.length - valid.length} con errores (no se cargan)</span> : null}</p>
      <ul className="max-h-72 overflow-y-auto rounded-xl border border-[#dce5e1] bg-white text-sm">
        {preview.map((r) => <li key={r.line} className={`flex items-start gap-2 border-b border-[#edf2f0] px-3 py-2 last:border-0 ${r.ok ? "" : "bg-rose-50/60"}`}>
          {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />}
          {r.ok ? <span className="min-w-0">{r.text}</span> : <span className="min-w-0"><span className="text-slate-500">Fila {r.line}:</span> <span className="font-semibold text-rose-700">{r.text}</span><span className="block truncate font-mono text-xs text-slate-400">{r.raw}</span></span>}
        </li>)}
      </ul>
    </div> : null}
    {report ? <pre className="whitespace-pre-wrap rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{report}</pre> : null}
    <div className="flex justify-end"><Button onClick={() => void save()} loading={saving} disabled={!valid.length}>{!saving ? <Upload /> : null}Cargar {valid.length || ""} {def.label.toLowerCase().split(" ")[0]}</Button></div>
  </div>;
}
