import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, RefreshCw, Syringe, Undo2, X } from "lucide-react";
import { formatDate, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import { dayBounds, formatTime } from "../lib/treatments";
import type { Dose, Farm, Treatment } from "../lib/types";
import { Button, Empty, Field, Modal, Textarea, toast } from "./ui";

type DoseRow = Dose & {
  calf: { tag: string; location: string } | null;
  treatment: Pick<Treatment, "protocol_name" | "product" | "dose" | "route" | "diagnosis"> | null;
};

const SELECT = "*, calf:simple_guachera_calves(tag,location), treatment:simple_guachera_treatments(protocol_name,product,dose,route,diagnosis)";

export function TodayPanel({ farm, userId, manager }: { farm: Farm; userId: string; manager: boolean }) {
  const [pending, setPending] = useState<DoseRow[] | null>(null);
  const [done, setDone] = useState<DoseRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<DoseRow | null>(null);
  const day = today();
  const { start, end } = dayBounds(day);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [p, d] = await Promise.all([
      supabase.from("simple_guachera_doses").select(SELECT).eq("farm_id", farm.id).eq("status", "Pendiente").lte("due_at", end).order("due_at"),
      supabase.from("simple_guachera_doses").select(SELECT).eq("farm_id", farm.id).in("status", ["Aplicada", "No aplicada"]).gte("done_at", start).order("done_at", { ascending: false }),
    ]);
    setRefreshing(false);
    const error = p.error ?? d.error;
    if (error) { toast.error(errorText(error, "No se pudieron cargar los tratamientos del día")); setPending((x) => x ?? []); return; }
    setPending(p.data as DoseRow[]);
    setDone(d.data as DoseRow[]);
  }, [farm.id, start, end]);

  useEffect(() => { void load(); }, [load]);

  async function record(dose: DoseRow, status: "Aplicada" | "No aplicada" | "Pendiente", notes = "") {
    setBusy(dose.id);
    const { error } = await supabase.rpc("simple_guachera_record_dose", { dose: dose.id, new_status: status, dose_notes: notes });
    setBusy(null);
    if (error) { toast.error(errorText(error, "No se pudo registrar")); return; }
    toast.ok(status === "Aplicada" ? `Dosis aplicada a ${dose.calf?.tag ?? "ternero"}` : status === "No aplicada" ? "Registrado como no aplicada" : "Dosis vuelta a pendiente");
    await load();
  }

  const overdue = useMemo(() => (pending ?? []).filter((d) => d.due_at < start), [pending, start]);
  const todays = useMemo(() => (pending ?? []).filter((d) => d.due_at >= start), [pending, start]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Tratamientos de hoy</h1><p className="text-sm text-slate-600">{farm.name} · {formatDate(day)}</p></div>
      <Button variant="ghost" onClick={() => void load()} aria-label="Actualizar" title="Actualizar"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
    </div>

    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Counter label="Pendientes" value={todays.length} tone="brand" />
      <Counter label="Atrasadas" value={overdue.length} tone={overdue.length ? "alert" : "plain"} />
      <Counter label="Hechas hoy" value={done.length} tone="plain" />
    </div>

    {pending === null ? <p className="py-10 text-center text-slate-500">Cargando…</p>
      : !pending.length && !done.length ? <Empty icon={<ClipboardCheck />} title="No hay tratamientos para hoy" text={manager ? "Cuando indiques un tratamiento desde “Tratamientos”, las dosis aparecen acá." : "Cuando el productor o veterinario indique un tratamiento, las dosis aparecen acá."} />
      : <>
        {overdue.length ? <Section title="Atrasadas" icon={<AlertTriangle className="text-amber-600" />}>
          {overdue.map((d) => <DoseCard key={d.id} dose={d} late busy={busy === d.id} onApply={() => void record(d, "Aplicada")} onSkip={() => setSkipping(d)} />)}
        </Section> : null}
        {todays.length ? <Section title="Para hoy" icon={<Syringe className="text-brand" />}>
          {todays.map((d) => <DoseCard key={d.id} dose={d} busy={busy === d.id} onApply={() => void record(d, "Aplicada")} onSkip={() => setSkipping(d)} />)}
        </Section> : pending.length === 0 ? <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-dark">Todas las dosis de hoy están registradas.</p> : null}
        {done.length ? <Section title="Registradas hoy" icon={<CheckCircle2 className="text-brand" />}>
          {done.map((d) => <DoneCard key={d.id} dose={d} canUndo={manager || d.done_by === userId} busy={busy === d.id} onUndo={() => void record(d, "Pendiente")} />)}
        </Section> : null}
      </>}

    {skipping ? <SkipModal dose={skipping} onClose={() => setSkipping(null)} onConfirm={async (notes) => { const d = skipping; setSkipping(null); await record(d, "No aplicada", notes); }} /> : null}
  </div>;
}

function Counter({ label, value, tone }: { label: string; value: number; tone: "brand" | "alert" | "plain" }) {
  const styles = { brand: "bg-brand-deep text-white", alert: "bg-amber-100 text-amber-900", plain: "border border-[#dce5e1] bg-white" }[tone];
  return <div className={`rounded-2xl p-3 ${styles}`}><p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p><p className="text-3xl font-black">{value}</p></div>;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-600 [&_svg]:size-4">{icon}{title}</h2><ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</ul></section>;
}

function DoseInfo({ dose }: { dose: DoseRow }) {
  const t = dose.treatment;
  return <div className="min-w-0 flex-1">
    <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-xl font-black">{dose.calf?.tag ?? "—"}</span><span className="text-sm text-slate-500">{dose.calf?.location}</span></p>
    <p className="font-bold text-brand-dark">{t?.product}{t?.dose ? ` · ${t.dose}` : ""}{t?.route ? ` · ${t.route}` : ""}</p>
    <p className="text-sm text-slate-500">{t?.protocol_name}{t?.diagnosis ? ` · ${t.diagnosis}` : ""} · dosis {dose.number} de {dose.total}</p>
  </div>;
}

function DoseCard({ dose, late, busy, onApply, onSkip }: { dose: DoseRow; late?: boolean; busy: boolean; onApply: () => void; onSkip: () => void }) {
  return <li className={`min-w-0 rounded-2xl border bg-white p-3 shadow-[0_4px_16px_rgba(15,76,58,.05)] ${late ? "border-amber-300" : "border-[#dce5e1]"}`}>
    <div className="flex gap-3">
      <div className={`grid h-12 w-14 shrink-0 place-items-center rounded-xl text-sm font-black ${late ? "bg-amber-100 text-amber-800" : "bg-brand-soft text-brand-dark"}`}>{late ? formatDate(dose.due_at.slice(0, 10)).slice(0, 5) : formatTime(dose.due_at)}</div>
      <DoseInfo dose={dose} />
    </div>
    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
      <Button onClick={onApply} loading={busy}>{!busy ? <Check /> : null}Aplicada</Button>
      <Button variant="secondary" onClick={onSkip} disabled={busy}><X />No aplicada</Button>
    </div>
  </li>;
}

function DoneCard({ dose, canUndo, busy, onUndo }: { dose: DoseRow; canUndo: boolean; busy: boolean; onUndo: () => void }) {
  const applied = dose.status === "Aplicada";
  return <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#dce5e1] bg-white/70 p-3">
    <span className={`grid size-10 shrink-0 place-items-center rounded-full ${applied ? "bg-brand-soft text-brand" : "bg-rose-50 text-rose-600"}`}>{applied ? <Check className="size-5" /> : <X className="size-5" />}</span>
    <div className="min-w-0 flex-1">
      <p className="truncate font-black">{dose.calf?.tag} <span className="font-semibold text-slate-500">· {dose.treatment?.product}</span></p>
      <p className="truncate text-sm text-slate-500">{applied ? "Aplicada" : "No aplicada"} {dose.done_at ? formatTime(dose.done_at) : ""}{dose.done_by_name ? ` · ${dose.done_by_name}` : ""}{dose.notes ? ` · ${dose.notes}` : ""}</p>
    </div>
    {canUndo ? <button onClick={onUndo} disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Deshacer" title="Deshacer"><Undo2 className="size-4" /></button> : null}
  </li>;
}

function SkipModal({ dose, onClose, onConfirm }: { dose: DoseRow; onClose: () => void; onConfirm: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const reasons = ["No se encontró el ternero", "Falta de producto", "Ternero recuperado", "Indicación del veterinario"];
  function submit(event: FormEvent) { event.preventDefault(); if (!notes.trim()) { toast.error("Indicá el motivo."); return; } void onConfirm(notes.trim()); }
  return <Modal title={`No aplicada · ${dose.calf?.tag ?? ""}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-2">{reasons.map((r) => <button key={r} type="button" onClick={() => setNotes(r)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${notes === r ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>{r}</button>)}</div>
      <Field label="Motivo"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} required /></Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit">Registrar</Button></div>
    </form>
  </Modal>;
}
