import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckSquare, Plus, Search, Square, Stethoscope, Trash2 } from "lucide-react";
import { formatDate } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import { describeSchedule, doseCount, formatDateTime, localInputToIso, nowLocalInput, progress } from "../lib/treatments";
import { SEVERITY_STYLE } from "../lib/indicators";
import type { Calf, Dose, Farm, Severity, Treatment } from "../lib/types";
import { useProtocols } from "./ProtocolsPanel";
import { Button, Empty, Field, Input, Modal, Select, Textarea, toast } from "./ui";

type TreatmentRow = Treatment & { calf: { tag: string } | null; doses: Pick<Dose, "status" | "due_at">[] };

export function TreatmentsPanel({ farm, onGoProtocols }: { farm: Farm; onGoProtocols: () => void }) {
  const [view, setView] = useState<"Activo" | "Finalizado">("Activo");
  const [rows, setRows] = useState<TreatmentRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<TreatmentRow | null>(null);

  const load = useCallback(async () => {
    let query = supabase.from("simple_guachera_treatments").select("*, calf:simple_guachera_calves(tag), doses:simple_guachera_doses(status,due_at)").eq("farm_id", farm.id).eq("status", view);
    query = view === "Activo" ? query.order("start_at", { ascending: false }) : query.order("closed_at", { ascending: false }).limit(60);
    const { data, error } = await query;
    if (error) { toast.error(errorText(error, "No se pudieron cargar los tratamientos")); setRows((r) => r ?? []); return; }
    setRows(data as TreatmentRow[]);
  }, [farm.id, view]);

  useEffect(() => { setRows(null); void load(); }, [load]);

  async function remove(t: TreatmentRow) {
    if (!window.confirm(`¿Eliminar el tratamiento de ${t.calf?.tag ?? "este ternero"} y todas sus dosis? Usalo solo si se cargó por error.`)) return;
    const { error } = await supabase.from("simple_guachera_treatments").delete().eq("id", t.id);
    if (error) { toast.error(errorText(error, "No se pudo eliminar")); return; }
    toast.ok("Tratamiento eliminado");
    await load();
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Tratamientos</h1><p className="text-sm text-slate-600">{farm.name}</p></div>
      <Button onClick={() => setCreating(true)}><Plus />Nuevo tratamiento</Button>
    </div>
    <div className="inline-grid grid-cols-2 rounded-xl bg-slate-100 p-1">
      {(["Activo", "Finalizado"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === v ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"}`}>{v === "Activo" ? "Activos" : "Finalizados"}</button>)}
    </div>

    {rows === null ? <p className="py-10 text-center text-slate-500">Cargando…</p>
      : !rows.length ? <Empty icon={<Stethoscope />} title={view === "Activo" ? "No hay tratamientos activos" : "Sin tratamientos finalizados"} text={view === "Activo" ? "Indicá un tratamiento eligiendo un protocolo y uno o varios terneros." : "Los tratamientos cerrados aparecen acá."} />
      : <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.map((t) => {
        const p = progress(t.doses);
        return <li key={t.id} className={`min-w-0 rounded-2xl border bg-white p-4 shadow-[0_4px_16px_rgba(15,76,58,.05)] ${t.status === "Activo" ? SEVERITY_STYLE[t.severity ?? "Leve"].card : "border-[#dce5e1]"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="flex items-center gap-2"><span className="text-xl font-black">{t.calf?.tag ?? "—"}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase ${SEVERITY_STYLE[t.severity ?? "Leve"].badge}`}>{t.severity ?? "Leve"}</span></p><p className="font-bold text-brand-dark">{t.protocol_name}</p></div>
            {t.status === "Finalizado" ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${t.outcome === "Recuperado" ? "bg-brand-soft text-brand-dark" : t.outcome === "Muerte" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{t.outcome}</span> : null}
          </div>
          <p className="text-sm text-slate-600">{t.product}{t.dose ? ` · ${t.dose}` : ""}{t.route ? ` · ${t.route}` : ""}</p>
          {t.diagnosis ? <p className="text-sm text-slate-500">Diagnóstico: {t.diagnosis}</p> : null}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
          <p className="mt-1.5 text-sm text-slate-600"><strong>{p.done}</strong> de {p.total} dosis aplicadas{p.missed ? <span className="text-rose-600"> · {p.missed} no aplicadas</span> : null}</p>
          <p className="text-xs text-slate-500">Inicio {formatDateTime(t.start_at)}{p.next && t.status === "Activo" ? ` · próxima ${formatDateTime(p.next.due_at)}` : ""}{t.withdrawal_until ? ` · retiro hasta ${formatDate(t.withdrawal_until)}` : ""}</p>
          {t.status === "Activo" ? <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setClosing(t)}>Cerrar tratamiento</Button>
            <Button variant="ghost" onClick={() => void remove(t)} aria-label="Eliminar" title="Eliminar (cargado por error)"><Trash2 /></Button>
          </div> : null}
        </li>;
      })}</ul>}

    {creating ? <NewTreatment farm={farm} onClose={() => setCreating(false)} onGoProtocols={() => { setCreating(false); onGoProtocols(); }} onSaved={async () => { setCreating(false); setView("Activo"); await load(); }} /> : null}
    {closing ? <CloseTreatment treatment={closing} onClose={() => setClosing(null)} onSaved={async () => { setClosing(null); await load(); }} /> : null}
  </div>;
}

function NewTreatment({ farm, onClose, onSaved, onGoProtocols }: { farm: Farm; onClose: () => void; onSaved: () => Promise<void>; onGoProtocols: () => void }) {
  const { protocols } = useProtocols(farm.id);
  const active = useMemo(() => (protocols ?? []).filter((p) => p.active && p.kind === "Tratamiento"), [protocols]);
  const [calves, setCalves] = useState<Pick<Calf, "id" | "tag" | "location">[]>([]);
  const [protocolId, setProtocolId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(nowLocalInput());
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState<Severity>("Leve");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.from("simple_guachera_calves").select("id,tag,location").eq("farm_id", farm.id).eq("active", true).order("tag").then(({ data }) => setCalves((data ?? []) as typeof calves));
  }, [farm.id]);
  useEffect(() => { if (!protocolId && active[0]) setProtocolId(active[0].id); }, [active, protocolId]);

  const protocol = active.find((p) => p.id === protocolId);
  const visible = calves.filter((c) => !query.trim() || c.tag.toLowerCase().includes(query.trim().toLowerCase()) || c.location.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allVisible = visible.length > 0 && visible.every((c) => selected.has(c.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!protocol) { toast.error("Elegí un protocolo."); return; }
    if (!selected.size) { toast.error("Elegí al menos un ternero."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("simple_guachera_start_treatment", { target_farm: farm.id, calf_ids: [...selected], protocol: protocol.id, start_at: localInputToIso(start), diagnosis: diagnosis.trim() || protocol.name, treatment_notes: notes.trim(), severity });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo indicar el tratamiento")); return; }
    toast.ok(data === 1 ? "Tratamiento indicado" : `Tratamiento indicado a ${data} terneros`);
    await onSaved();
  }

  if (protocols && !active.length) return <Modal title="Nuevo tratamiento" onClose={onClose}>
    <p className="text-slate-600">Primero creá al menos un protocolo (producto, dosis, vía y frecuencia).</p>
    <Button className="mt-5 w-full" onClick={onGoProtocols}><Plus />Ir a Protocolos</Button>
  </Modal>;

  return <Modal title="Nuevo tratamiento" onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <Field label="Protocolo"><Select value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>{active.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.product}</option>)}</Select></Field>
      {protocol ? <p className="-mt-2 rounded-xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-dark">{protocol.dose ? `${protocol.dose} · ` : ""}{protocol.route ? `${protocol.route} · ` : ""}{describeSchedule(protocol.interval_hours, protocol.duration_days)}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Primera dosis" hint="Hora de Argentina"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Diagnóstico" hint="Opcional"><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder={protocol?.name} /></Field>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Gravedad <span className="font-normal text-slate-500">(el operario lo ve con este color)</span></p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">{(["Leve", "Moderado", "Grave"] as const).map((s) => <button key={s} type="button" onClick={() => setSeverity(s)} className={`flex items-center justify-center gap-2 rounded-xl border-2 px-2 py-2.5 text-sm font-bold ${severity === s ? "border-ink bg-white" : "border-transparent bg-slate-100 text-slate-600"}`}><span className={`size-3 rounded-full ${SEVERITY_STYLE[s].dot}`} />{s}</button>)}</div>
      </div>
      <div>
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">Terneros <span className="text-brand">({selected.size} elegidos)</span></p>
          <button type="button" className="text-sm font-bold text-brand" onClick={() => setSelected((s) => { const n = new Set(s); visible.forEach((c) => (allVisible ? n.delete(c.id) : n.add(c.id))); return n; })}>{allVisible ? "Quitar visibles" : "Elegir visibles"}</button></div>
        <div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar caravana o ubicación" className="!mt-0 pl-9" /></div>
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#dce5e1]">
          {!visible.length ? <li className="p-3 text-sm text-slate-500">{calves.length ? "Ningún ternero coincide." : "No hay terneros activos."}</li> : visible.map((c) => <li key={c.id}>
            <button type="button" onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 border-b border-[#edf2f0] px-3 py-2.5 text-left last:border-0 hover:bg-slate-50">
              {selected.has(c.id) ? <CheckSquare className="size-5 text-brand" /> : <Square className="size-5 text-slate-300" />}
              <span className="font-bold">{c.tag}</span><span className="truncate text-sm text-slate-500">{c.location}</span>
            </button>
          </li>)}
        </ul>
      </div>
      <Field label="Indicaciones para el operario" hint="Opcional"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      {protocol && selected.size ? <p className="text-sm text-slate-600">Se van a generar <strong>{doseCount(protocol.interval_hours, protocol.duration_days) * selected.size}</strong> dosis en total ({doseCount(protocol.interval_hours, protocol.duration_days)} por ternero).</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Indicar tratamiento</Button></div>
    </form>
  </Modal>;
}

function CloseTreatment({ treatment, onClose, onSaved }: { treatment: TreatmentRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [result, setResult] = useState<NonNullable<Treatment["outcome"]>>("Recuperado");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = treatment.doses.filter((d) => d.status === "Pendiente").length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc("simple_guachera_close_treatment", { treatment: treatment.id, result, close_notes: notes.trim() });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo cerrar")); return; }
    toast.ok("Tratamiento cerrado");
    await onSaved();
  }

  return <Modal title={`Cerrar tratamiento · ${treatment.calf?.tag ?? ""}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">{(["Recuperado", "Sin respuesta", "Muerte", "Otro"] as const).map((r) => <button key={r} type="button" onClick={() => setResult(r)} className={`rounded-xl px-3 py-3 text-sm font-bold ${result === r ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>{r}</button>)}</div>
      {pending ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Quedan {pending} dosis pendientes: se van a cancelar y dejan de aparecer en “Hoy”.</p> : null}
      <Field label="Observaciones" hint="Opcional"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Cerrar tratamiento</Button></div>
    </form>
  </Modal>;
}
