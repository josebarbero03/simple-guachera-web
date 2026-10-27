import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BellRing, Check, CheckCircle2, ClipboardCheck, RefreshCw, ShieldPlus, Syringe, Undo2, X } from "lucide-react";
import { ageDays, formatDate } from "../lib/calves";
import { SEVERITY_STYLE } from "../lib/indicators";
import { supabase } from "../lib/supabase";
import { describePlanDays, formatTime } from "../lib/treatments";
import type { Farm } from "../lib/types";
import { useDayTasks, type DoseRow, type PlanItem, type Skipping } from "../hooks/useDayTasks";
import { Button, Empty, Field, Modal, Textarea, toast } from "./ui";

export function TodayPanel({ farm, userId, manager, onGoReports }: { farm: Farm; userId: string; manager: boolean; onGoReports: () => void }) {
  const [reports, setReports] = useState<{ total: number; urgent: number }>({ total: 0, urgent: 0 });
  const [skipping, setSkipping] = useState<Skipping | null>(null);
  const { day, start, pending, done, plan, planDone, refreshing, busy, load, recordDose, recordPlan } = useDayTasks(farm);
  useEffect(() => {
    if (!manager) return;
    void supabase.from("simple_guachera_reports").select("urgent").eq("farm_id", farm.id).eq("status", "Pendiente").then(({ data }) => {
      const list = (data ?? []) as { urgent: boolean }[];
      setReports({ total: list.length, urgent: list.filter((r) => r.urgent).length });
    });
  }, [manager, farm.id]);


  const overdue = useMemo(() => (pending ?? []).filter((d) => d.due_at < start), [pending, start]);
  const todays = useMemo(() => (pending ?? []).filter((d) => d.due_at >= start), [pending, start]);
  const planLate = plan.filter((i) => i.until < day);
  const graves = (pending ?? []).filter((d) => d.treatment?.severity === "Grave").length;
  const nothing = pending !== null && !pending.length && !done.length && !plan.length && !planDone.length;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Tareas sanitarias de hoy</h1><p className="text-sm text-slate-600">{farm.name} · {formatDate(day)}</p></div>
      <Button variant="ghost" onClick={() => void load()} aria-label="Actualizar" title="Actualizar"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
    </div>

    {manager && reports.total ? <button onClick={onGoReports} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left font-bold ${reports.urgent ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-900"}`}>
      <BellRing className="size-5 shrink-0" /><span className="flex-1">{reports.total === 1 ? "1 aviso del equipo para revisar" : `${reports.total} avisos del equipo para revisar`}{reports.urgent ? ` · ${reports.urgent} urgente${reports.urgent > 1 ? "s" : ""}` : ""}</span><span className="text-sm underline">Ver</span>
    </button> : null}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <Counter label="Para hacer" value={todays.length + plan.length - planLate.length} tone="brand" />
      <Counter label="Atrasadas" value={overdue.length + planLate.length} tone={overdue.length + planLate.length ? "alert" : "plain"} />
      <Counter label="Graves" value={graves} tone={graves ? "danger" : "plain"} />
      <Counter label="Hechas hoy" value={done.length + planDone.length} tone="plain" />
    </div>
    <Legend />

    {pending === null ? <p className="py-10 text-center text-slate-500">Cargando…</p>
      : nothing ? <Empty icon={<ClipboardCheck />} title="No hay tareas sanitarias para hoy" text={manager ? "Las dosis de los tratamientos y las aplicaciones del plan sanitario aparecen acá el día que corresponden." : "Cuando el productor o veterinario indique un tratamiento o un plan sanitario, las tareas aparecen acá."} />
      : <>
        {overdue.length ? <Section title="Dosis atrasadas" icon={<AlertTriangle className="text-amber-600" />}>
          {overdue.map((d) => <DoseCard key={d.id} dose={d} late busy={busy === d.id} onApply={() => void recordDose(d, "Aplicada")} onSkip={() => setSkipping({ kind: "dose", dose: d })} />)}
        </Section> : null}
        {todays.length ? <Section title="Tratamientos de hoy" icon={<Syringe className="text-brand" />}>
          {todays.map((d) => <DoseCard key={d.id} dose={d} busy={busy === d.id} onApply={() => void recordDose(d, "Aplicada")} onSkip={() => setSkipping({ kind: "dose", dose: d })} />)}
        </Section> : null}
        {plan.length ? <Section title="Plan sanitario" icon={<ShieldPlus className="text-sky-600" />}>
          {plan.map((i) => { const key = `${i.calf.id}|${i.protocol.id}`; return <PlanCard key={key} item={i} late={i.until < day} busy={busy === key} onApply={() => void recordPlan(i.calf.id, i.protocol.id, i.calf.tag, "Aplicada")} onSkip={() => setSkipping({ kind: "plan", item: i })} />; })}
        </Section> : null}
        {!overdue.length && !todays.length && !plan.length ? <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-dark">Todas las tareas de hoy están registradas.</p> : null}
        {done.length || planDone.length ? <Section title="Registradas hoy" icon={<CheckCircle2 className="text-brand" />}>
          {done.map((d) => <DoneCard key={d.id} tag={d.calf?.tag} what={d.treatment?.product} status={d.status} at={d.done_at} by={d.done_by_name} notes={d.notes} canUndo={manager || d.done_by === userId} busy={busy === d.id} onUndo={() => void recordDose(d, "Pendiente")} />)}
          {planDone.map((a) => <DoneCard key={a.id} tag={a.calf?.tag} what={`${a.protocol?.name ?? "Plan"} (plan)`} status={a.status} at={a.done_at} by={a.done_by_name} notes={a.notes} canUndo={manager || a.done_by === userId} busy={busy === `${a.calf_id}|${a.protocol_id}`} onUndo={() => void recordPlan(a.calf_id, a.protocol_id, a.calf?.tag ?? "", "Pendiente")} />)}
        </Section> : null}
      </>}

    {skipping ? <SkipModal title={skipping.kind === "dose" ? skipping.dose.calf?.tag ?? "" : skipping.item.calf.tag} onClose={() => setSkipping(null)} onConfirm={async (notes) => {
      const s = skipping; setSkipping(null);
      if (s.kind === "dose") await recordDose(s.dose, "No aplicada", notes);
      else await recordPlan(s.item.calf.id, s.item.protocol.id, s.item.calf.tag, "No aplicada", notes);
    }} /> : null}
  </div>;
}

function Legend() {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
    {(["Grave", "Moderado", "Leve"] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${SEVERITY_STYLE[s].dot}`} />{s}</span>)}
    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sky-500" />Plan sanitario</span>
  </div>;
}

function Counter({ label, value, tone }: { label: string; value: number; tone: "brand" | "alert" | "danger" | "plain" }) {
  const styles = { brand: "bg-brand-deep text-white", alert: "bg-amber-100 text-amber-900", danger: "bg-rose-600 text-white", plain: "border border-[#dce5e1] bg-white" }[tone];
  return <div className={`rounded-2xl p-3 ${styles}`}><p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p><p className="text-3xl font-black">{value}</p></div>;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-600 [&_svg]:size-4">{icon}{title}</h2><ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</ul></section>;
}

function Actions({ busy, onApply, onSkip }: { busy: boolean; onApply: () => void; onSkip: () => void }) {
  return <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
    <Button onClick={onApply} loading={busy}>{!busy ? <Check /> : null}Aplicada</Button>
    <Button variant="secondary" onClick={onSkip} disabled={busy}><X />No aplicada</Button>
  </div>;
}

function DoseCard({ dose, late, busy, onApply, onSkip }: { dose: DoseRow; late?: boolean; busy: boolean; onApply: () => void; onSkip: () => void }) {
  const t = dose.treatment;
  const severity = t?.severity ?? "Leve";
  const style = SEVERITY_STYLE[severity];
  return <li className={`min-w-0 rounded-2xl border bg-white p-3 shadow-[0_4px_16px_rgba(15,76,58,.05)] ${style.card}`}>
    <div className="flex gap-3">
      <div className={`grid h-12 w-14 shrink-0 place-items-center rounded-xl text-sm font-black ${late ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"}`} title={late ? "Atrasada" : "Horario"}>{late ? formatDate(dose.due_at.slice(0, 10)).slice(0, 5) : formatTime(dose.due_at)}</div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xl font-black">{dose.calf?.tag ?? "—"}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase ${style.badge}`}>{severity}</span><span className="text-sm text-slate-500">{dose.calf?.location}</span></p>
        <p className="font-bold text-brand-dark">{t?.product}{t?.dose ? ` · ${t.dose}` : ""}{t?.route ? ` · ${t.route}` : ""}</p>
        <p className="text-sm text-slate-500">{t?.protocol_name}{t?.diagnosis && t.diagnosis !== t.protocol_name ? ` · ${t.diagnosis}` : ""} · dosis {dose.number} de {dose.total}</p>
        {t?.notes ? <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-700">{t.notes}</p> : null}
      </div>
    </div>
    <Actions busy={busy} onApply={onApply} onSkip={onSkip} />
  </li>;
}

function PlanCard({ item, late, busy, onApply, onSkip }: { item: PlanItem; late: boolean; busy: boolean; onApply: () => void; onSkip: () => void }) {
  const p = item.protocol;
  return <li className="min-w-0 rounded-2xl border border-sky-200 border-l-[6px] border-l-sky-500 bg-white p-3 shadow-[0_4px_16px_rgba(15,76,58,.05)]">
    <div className="flex gap-3">
      <div className={`grid h-12 min-w-14 shrink-0 place-items-center rounded-xl px-1 text-center text-xs font-black leading-tight ${late ? "bg-amber-100 text-amber-800" : "bg-sky-50 text-sky-800"}`}>{p.age_day_to != null && p.age_day_to > p.age_day! ? <>días<br />{p.age_day}–{p.age_day_to}</> : <>día<br />{p.age_day}</>}</div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2"><span className="text-xl font-black">{item.calf.tag}</span><span className="text-sm text-slate-500">{item.calf.location}</span></p>
        <p className="font-bold text-sky-900">{p.product}{p.dose ? ` · ${p.dose}` : ""}{p.route ? ` · ${p.route}` : ""}</p>
        <p className="text-sm text-slate-500">{p.name} · {ageDays(item.calf.birth_date)} días de vida · {late ? `vencía el ${formatDate(item.until)}` : item.until > item.due ? `aplicar hasta el ${formatDate(item.until)}` : describePlanDays(p.age_day, p.age_day_to)}</p>
        {p.notes ? <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-700">{p.notes}</p> : null}
      </div>
    </div>
    <Actions busy={busy} onApply={onApply} onSkip={onSkip} />
  </li>;
}

function DoneCard({ tag, what, status, at, by, notes, canUndo, busy, onUndo }: { tag?: string; what?: string; status: string; at: string | null; by: string; notes: string; canUndo: boolean; busy: boolean; onUndo: () => void }) {
  const applied = status === "Aplicada";
  return <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#dce5e1] bg-white/70 p-3">
    <span className={`grid size-10 shrink-0 place-items-center rounded-full ${applied ? "bg-brand-soft text-brand" : "bg-rose-50 text-rose-600"}`}>{applied ? <Check className="size-5" /> : <X className="size-5" />}</span>
    <div className="min-w-0 flex-1">
      <p className="truncate font-black">{tag} <span className="font-semibold text-slate-500">· {what}</span></p>
      <p className="truncate text-sm text-slate-500">{applied ? "Aplicada" : "No aplicada"} {at ? formatTime(at) : ""}{by ? ` · ${by}` : ""}{notes ? ` · ${notes}` : ""}</p>
    </div>
    {canUndo ? <button onClick={onUndo} disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Deshacer" title="Deshacer"><Undo2 className="size-4" /></button> : null}
  </li>;
}

function SkipModal({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const reasons = ["No se encontró el ternero", "Falta de producto", "Ternero recuperado", "Indicación del veterinario"];
  function submit(event: FormEvent) { event.preventDefault(); if (!notes.trim()) { toast.error("Indicá el motivo."); return; } void onConfirm(notes.trim()); }
  return <Modal title={`No aplicada · ${title}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-2">{reasons.map((r) => <button key={r} type="button" onClick={() => setNotes(r)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${notes === r ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>{r}</button>)}</div>
      <Field label="Motivo"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} required /></Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit">Registrar</Button></div>
    </form>
  </Modal>;
}
