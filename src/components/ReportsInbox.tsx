import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, RefreshCw, Stethoscope, Undo2 } from "lucide-react";
import { REPORTS_BUCKET } from "../lib/media";
import { errorText, supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/treatments";
import type { Farm, Report } from "../lib/types";
import { ReportAttachments } from "./ReportAttachments";
import { NewTreatment } from "./TreatmentsPanel";
import { Button, Empty, Textarea, toast } from "./ui";

type ReportRow = Report & { calf: { id: string; tag: string; location: string } | null };

/** Productor / veterinario: revisa los avisos del equipo, diagnostica e indica tratamientos. */
export function ReportsInbox({ farm, onGoProtocols }: { farm: Farm; onGoProtocols: () => void }) {
  const [view, setView] = useState<"Pendiente" | "Revisado">("Pendiente");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [treating, setTreating] = useState<{ report: ReportRow; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("simple_guachera_reports").select("*, calf:simple_guachera_calves(id,tag,location)").eq("farm_id", farm.id).eq("status", view)
      .order(view === "Pendiente" ? "urgent" : "diagnosed_at", { ascending: false }).order("created_at", { ascending: false }).limit(60);
    if (error) { toast.error(errorText(error, "No se pudieron cargar los avisos")); setRows((r) => r ?? []); return; }
    setRows(data as ReportRow[]);
  }, [farm.id, view]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  async function diagnose(r: ReportRow, diagnosis: string, status: "Pendiente" | "Revisado" = "Revisado") {
    const { error } = await supabase.rpc("simple_guachera_diagnose_report", { report: r.id, report_diagnosis: diagnosis, new_status: status });
    if (error) { toast.error(errorText(error, "No se pudo guardar")); return false; }
    toast.ok(status === "Revisado" ? "Diagnóstico guardado: el operario ya lo ve" : "Aviso vuelto a pendiente");
    await load();
    return true;
  }

  async function remove(r: ReportRow) {
    if (!window.confirm("¿Borrar este aviso con sus fotos y audio?")) return;
    const { error } = await supabase.from("simple_guachera_reports").delete().eq("id", r.id);
    if (error) { toast.error(errorText(error, "No se pudo borrar")); return; }
    if (r.attachments.length) await supabase.storage.from(REPORTS_BUCKET).remove(r.attachments.map((a) => a.path));
    await load();
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Avisos del equipo</h1><p className="text-sm text-slate-600">Fotos, audios y observaciones para diagnosticar · {farm.name}</p></div>
      <Button variant="ghost" onClick={() => void load()} aria-label="Actualizar" title="Actualizar"><RefreshCw /></Button>
    </div>
    <div className="inline-grid grid-cols-2 rounded-xl bg-slate-100 p-1">
      {(["Pendiente", "Revisado"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === v ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"}`}>{v === "Pendiente" ? "Para revisar" : "Revisados"}</button>)}
    </div>

    {rows === null ? <p className="py-10 text-center text-slate-500">Cargando…</p>
      : !rows.length ? <Empty icon={<BellRing />} title={view === "Pendiente" ? "No hay avisos para revisar" : "Sin avisos revisados"} text={view === "Pendiente" ? "Cuando un operario envíe fotos o audios desde “Avisar”, aparecen acá." : "Los avisos diagnosticados quedan guardados acá."} />
      : <ul className="space-y-3">{rows.map((r) => <ReportCard key={r.id} report={r} onDiagnose={(d, s) => diagnose(r, d, s)} onTreat={(text) => setTreating({ report: r, text })} onDelete={() => void remove(r)} />)}</ul>}

    {treating ? <NewTreatment farm={farm} preselected={treating.report.calf ? [treating.report.calf.id] : []} initialDiagnosis={(treating.text || treating.report.notes).slice(0, 120)}
      onClose={() => setTreating(null)} onGoProtocols={() => { setTreating(null); onGoProtocols(); }}
      onSaved={async (diagnosis) => { const { report, text } = treating; setTreating(null); await diagnose(report, text ? `${text} · tratamiento indicado` : `${diagnosis} · tratamiento indicado`); }} /> : null}
  </div>;
}

function ReportCard({ report: r, onDiagnose, onTreat, onDelete }: { report: ReportRow; onDiagnose: (diagnosis: string, status?: "Pendiente" | "Revisado") => Promise<boolean>; onTreat: (text: string) => void; onDelete: () => void }) {
  const [text, setText] = useState(r.diagnosis);
  const [saving, setSaving] = useState(false);
  const pending = r.status === "Pendiente";
  const save = async (status: "Pendiente" | "Revisado" = "Revisado") => { setSaving(true); await onDiagnose(text.trim(), status); setSaving(false); };

  return <li className={`space-y-3 rounded-2xl border bg-white p-4 shadow-[0_4px_16px_rgba(15,76,58,.05)] ${r.urgent && pending ? "border-rose-300 border-l-[6px] border-l-rose-600" : "border-[#dce5e1]"}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2"><span className="text-lg font-black">{r.calf ? `Ternero ${r.calf.tag}` : "Aviso general"}</span>{r.urgent ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-black uppercase text-white">Urgente</span> : null}{r.calf?.location ? <span className="text-sm text-slate-500">{r.calf.location}</span> : null}</p>
        <p className="text-xs text-slate-500">{r.author_name || "Operario"} · {formatDateTime(r.created_at)}</p>
      </div>
      <button onClick={onDelete} className="text-xs font-semibold text-slate-400 hover:text-rose-600">Borrar</button>
    </div>
    {r.notes ? <p className="whitespace-pre-line text-slate-800">{r.notes}</p> : null}
    <ReportAttachments items={r.attachments} />
    {pending ? <div className="space-y-2 border-t border-[#edf2f0] pt-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Diagnóstico o indicación para el operario" aria-label="Diagnóstico" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => void save()} loading={saving} className="sm:flex-1">{!saving ? <CheckCircle2 /> : null}Guardar diagnóstico</Button>
        <Button variant="secondary" onClick={() => onTreat(text.trim())} className="sm:flex-1"><Stethoscope />Indicar tratamiento</Button>
      </div>
    </div> : <div className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">
      <p className="min-w-0 flex-1"><strong>Diagnóstico{r.diagnosed_by_name ? ` de ${r.diagnosed_by_name}` : ""}{r.diagnosed_at ? ` · ${formatDateTime(r.diagnosed_at)}` : ""}:</strong> {r.diagnosis || "Revisado, sin comentarios."}</p>
      <button onClick={() => void save("Pendiente")} className="shrink-0 text-slate-500 hover:text-brand-dark" title="Volver a pendiente" aria-label="Volver a pendiente"><Undo2 className="size-4" /></button>
    </div>}
  </li>;
}
