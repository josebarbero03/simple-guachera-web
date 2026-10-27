import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { ageDays, daysBetween, effectiveCategory, formatAge, formatDate, formatKg, parseNum, today, validateCalf } from "../lib/calves";
import { SEVERITY_STYLE, tpiCategory } from "../lib/indicators";
import { errorText, supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/treatments";
import type { CategoryDef } from "../lib/farmSettings";
import type { Calf, CalfInput, CategoryMove, ExitReason, PlanApplication, Treatment, Weight } from "../lib/types";
import { Button, Field, Input, Modal, Select, Textarea, toast } from "./ui";

type Tab = "datos" | "categoria" | "calostrado" | "pesadas" | "sanidad" | "salida";
const TABS: { id: Tab; label: string }[] = [
  { id: "datos", label: "Datos" }, { id: "categoria", label: "Categoría" }, { id: "calostrado", label: "Calostrado" }, { id: "pesadas", label: "Pesadas" },
  { id: "sanidad", label: "Sanidad" }, { id: "salida", label: "Destete / baja" },
];
export const EXIT_REASONS: ExitReason[] = ["Muerte", "Venta", "Traslado", "Otro"];
export const TPI_STYLE = { Excelente: "bg-emerald-600 text-white", Buena: "bg-emerald-100 text-emerald-800", Regular: "bg-amber-100 text-amber-900", Pobre: "bg-rose-600 text-white" };

export function CalfDetail({ calf, categories, onClose, onChanged }: { calf: Calf; categories: CategoryDef[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("datos");
  const days = ageDays(calf.birth_date);
  return <Modal title={`Ternero ${calf.tag}`} onClose={onClose}>
    <p className="-mt-3 mb-3 text-sm text-slate-500">{calf.sex} · {formatAge(days)} · {calf.active ? `${effectiveCategory(calf, undefined, categories).name}${calf.category ? "" : " (por edad)"}` : `Baja (${calf.exit_reason ?? "sin motivo"})`}</p>
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${tab === t.id ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{t.label}</button>)}
    </div>
    {tab === "datos" ? <DataTab calf={calf} onSaved={onChanged} />
      : tab === "categoria" ? <CategoryTab calf={calf} categories={categories} onSaved={onChanged} />
      : tab === "calostrado" ? <ColostrumTab calf={calf} onSaved={onChanged} />
      : tab === "pesadas" ? <WeightsTab calf={calf} />
      : tab === "sanidad" ? <HealthTab calf={calf} />
      : <ExitTab calf={calf} onSaved={onChanged} />}
  </Modal>;
}

async function updateCalf(id: string, values: Partial<Calf>, ok: string) {
  const { error } = await supabase.from("simple_guachera_calves").update(values).eq("id", id);
  if (error) { toast.error(errorText(error, "No se pudo guardar")); return false; }
  toast.ok(ok);
  return true;
}

function SaveRow({ saving }: { saving: boolean }) {
  return <div className="flex justify-end pt-1"><Button type="submit" loading={saving}>Guardar</Button></div>;
}

function CategoryTab({ calf, categories, onSaved }: { calf: Calf; categories: CategoryDef[]; onSaved: () => Promise<void> }) {
  const cat = effectiveCategory(calf, undefined, categories);
  const [moves, setMoves] = useState<CategoryMove[] | null>(null);
  const [target, setTarget] = useState(calf.category ?? "");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("simple_guachera_category_moves").select("*").eq("calf_id", calf.id).order("moved_on", { ascending: false }).order("created_at", { ascending: false });
    setMoves((data ?? []) as CategoryMove[]);
  }, [calf.id]);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((calf.category ?? "") === target) { toast.error("Ya está en esa categoría."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("simple_guachera_change_category", { calf_ids: [calf.id], new_category: target, moved_on: date, move_notes: notes.trim() });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo cambiar la categoría")); return; }
    toast.ok("Categoría cambiada");
    setNotes("");
    await load();
    await onSaved();
  }

  return <div className="space-y-4">
    <div className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">
      <p>Categoría actual: <strong>{cat.name}</strong> {cat.manual ? "(asignada a mano)" : "(automática según la edad)"}</p>
      {cat.manual && cat.byAge !== cat.name ? <p className={cat.overdue ? "font-bold text-amber-800" : ""}>Por edad le correspondería {cat.byAge}.</p> : null}
    </div>
    {calf.active ? <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pasar a"><Select value={target} onChange={(e) => setTarget(e.target.value)}>
          {categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.minAgeDays}–{c.maxAgeDays} días)</option>)}
          <option value="">Automática (según la edad)</option>
        </Select></Field>
        <Field label="Fecha"><Input type="date" min={calf.birth_date} max={today()} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      <Field label="Observaciones" hint="Opcional"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex justify-end"><Button type="submit" loading={saving}>Cambiar categoría</Button></div>
    </form> : <p className="text-sm text-slate-500">El ternero está dado de baja.</p>}
    <div><p className="mb-2 text-sm font-black text-slate-700">Historial</p>
      {moves === null ? <p className="text-sm text-slate-500">Cargando…</p> : !moves.length ? <p className="text-sm text-slate-500">Sin cambios de categoría registrados.</p>
        : <ul className="space-y-1.5">{moves.map((m) => <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><strong>{formatDate(m.moved_on)}</strong> · {m.from_category} → <strong>{m.to_category}</strong>{m.moved_by_name ? <span className="text-slate-500"> · {m.moved_by_name}</span> : null}{m.notes ? <span className="block text-slate-600">{m.notes}</span> : null}</li>)}</ul>}
    </div>
  </div>;
}

function DataTab({ calf, onSaved }: { calf: Calf; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ tag: calf.tag, sex: calf.sex, birth_date: calf.birth_date, birth_weight: calf.birth_weight != null ? String(calf.birth_weight) : "", location: calf.location, notes: calf.notes });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const values: CalfInput = { tag: form.tag.trim(), sex: form.sex, birth_date: form.birth_date, birth_weight: parseNum(form.birth_weight), location: form.location.trim(), notes: form.notes.trim() };
    const problem = validateCalf(values);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    if (await updateCalf(calf.id, values, `Ternero ${values.tag} actualizado`)) await onSaved();
    setSaving(false);
  }
  return <form onSubmit={submit} className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <Field label="Caravana"><Input value={form.tag} onChange={(e) => set("tag", e.target.value)} required /></Field>
      <Field label="Sexo"><Select value={form.sex} onChange={(e) => set("sex", e.target.value)}><option>Hembra</option><option>Macho</option></Select></Field>
      <Field label="Fecha de nacimiento"><Input type="date" max={today()} value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} required /></Field>
      <Field label="Peso al nacer (kg)"><Input inputMode="decimal" value={form.birth_weight} onChange={(e) => set("birth_weight", e.target.value)} /></Field>
    </div>
    <Field label="Ubicación"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Estaca, sector o corral" /></Field>
    <Field label="Observaciones"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
    <SaveRow saving={saving} />
  </form>;
}

export function ColostrumFields({ form, set }: { form: Record<"colostrum_liters" | "colostrum_brix" | "colostrum_hours" | "serum_tp" | "serum_brix", string>; set: (key: keyof typeof form, value: string) => void }) {
  return <>
    <p className="text-sm font-black text-slate-700">Calostrado al nacer</p>
    <div className="grid grid-cols-3 gap-3">
      <Field label="Litros" hint="Meta ≥ 4 L"><Input inputMode="decimal" value={form.colostrum_liters} onChange={(e) => set("colostrum_liters", e.target.value)} /></Field>
      <Field label="Brix calostro %" hint="Meta ≥ 22 %"><Input inputMode="decimal" value={form.colostrum_brix} onChange={(e) => set("colostrum_brix", e.target.value)} /></Field>
      <Field label="Horas de vida" hint="Cuanto antes"><Input inputMode="decimal" value={form.colostrum_hours} onChange={(e) => set("colostrum_hours", e.target.value)} /></Field>
    </div>
    <p className="pt-1 text-sm font-black text-slate-700">Control en sangre (24 h a 7 días)</p>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Proteína total (g/dL)" hint="Excelente ≥ 6,2"><Input inputMode="decimal" value={form.serum_tp} onChange={(e) => set("serum_tp", e.target.value)} /></Field>
      <Field label="Brix suero %" hint="Excelente ≥ 9,4"><Input inputMode="decimal" value={form.serum_brix} onChange={(e) => set("serum_brix", e.target.value)} /></Field>
    </div>
  </>;
}

type ColostrumValues = Pick<Calf, "colostrum_liters" | "colostrum_brix" | "colostrum_hours" | "serum_tp" | "serum_brix">;

export function colostrumValues(form: Record<keyof ColostrumValues, string>): { values: ColostrumValues; error?: undefined } | { error: string; values?: undefined } {
  const v = { colostrum_liters: parseNum(form.colostrum_liters), colostrum_brix: parseNum(form.colostrum_brix), colostrum_hours: parseNum(form.colostrum_hours), serum_tp: parseNum(form.serum_tp), serum_brix: parseNum(form.serum_brix) };
  const bad = (x: number | null, min: number, max: number) => x !== null && (!Number.isFinite(x) || x < min || x > max);
  if (bad(v.colostrum_liters, 0, 10)) return { error: "Litros de calostro entre 0 y 10." };
  if (bad(v.colostrum_brix, 0, 40)) return { error: "Brix del calostro entre 0 y 40 %." };
  if (bad(v.colostrum_hours, 0, 72)) return { error: "Horas de vida entre 0 y 72." };
  if (bad(v.serum_tp, 2, 12)) return { error: "Proteína total entre 2 y 12 g/dL." };
  if (bad(v.serum_brix, 4, 15)) return { error: "Brix en suero entre 4 y 15 %." };
  return { values: v };
}

const str = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");

function ColostrumTab({ calf, onSaved }: { calf: Calf; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ colostrum_liters: str(calf.colostrum_liters), colostrum_brix: str(calf.colostrum_brix), colostrum_hours: str(calf.colostrum_hours), serum_tp: str(calf.serum_tp), serum_brix: str(calf.serum_brix) });
  const [saving, setSaving] = useState(false);
  const parsed = colostrumValues(form);
  const category = parsed.values ? tpiCategory(parsed.values) : null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.error !== undefined) { toast.error(parsed.error); return; }
    setSaving(true);
    if (await updateCalf(calf.id, parsed.values!, "Calostrado guardado")) await onSaved();
    setSaving(false);
  }
  return <form onSubmit={submit} className="space-y-3">
    <ColostrumFields form={form} set={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
    {category ? <p className={`rounded-xl px-3 py-2 text-sm font-bold ${TPI_STYLE[category]}`}>Transferencia de inmunidad pasiva: {category}</p> : null}
    <p className="text-xs text-slate-500">Categorías según Lombard et al. 2020 (J. Dairy Sci.). Meta de rodeo: más del 40 % excelente y menos del 10 % pobre.</p>
    <SaveRow saving={saving} />
  </form>;
}

function WeightsTab({ calf }: { calf: Calf }) {
  const [weights, setWeights] = useState<Weight[] | null>(null);
  const [date, setDate] = useState(today());
  const [kg, setKg] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("simple_guachera_weights").select("*").eq("calf_id", calf.id).order("weighed_at");
    if (error) { toast.error(errorText(error, "No se pudieron cargar las pesadas")); setWeights([]); return; }
    setWeights(data as Weight[]);
  }, [calf.id]);
  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const weight = parseNum(kg);
    if (weight === null || !Number.isFinite(weight) || weight <= 0 || weight >= 1000) { toast.error("Ingresá un peso válido en kg."); return; }
    if (date < calf.birth_date || date > today()) { toast.error("La fecha debe ser entre el nacimiento y hoy."); return; }
    setSaving(true);
    const { error } = await supabase.from("simple_guachera_weights").upsert({ farm_id: calf.farm_id, calf_id: calf.id, weighed_at: date, weight }, { onConflict: "calf_id,weighed_at" });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo guardar")); return; }
    toast.ok("Pesada registrada");
    setKg("");
    await load();
  }
  async function remove(w: Weight) {
    if (!window.confirm(`¿Borrar la pesada del ${formatDate(w.weighed_at)}?`)) return;
    const { error } = await supabase.from("simple_guachera_weights").delete().eq("id", w.id);
    if (error) { toast.error(errorText(error, "No se pudo borrar")); return; }
    await load();
  }

  const birth = calf.birth_weight ? Number(calf.birth_weight) : null;
  const rows = [...(weights ?? [])].sort((a, b) => a.weighed_at.localeCompare(b.weighed_at)).map((w, i, all) => {
    const age = daysBetween(calf.birth_date, w.weighed_at);
    const prev = all[i - 1];
    const sinceBirth = birth && age > 0 ? (Number(w.weight) - birth) / age : null;
    const sincePrev = prev ? (Number(w.weight) - Number(prev.weight)) / Math.max(1, daysBetween(prev.weighed_at, w.weighed_at)) : null;
    return { w, age, sinceBirth, sincePrev };
  });
  const last = rows.at(-1);
  const goal = birth ? birth / 60 : null;

  return <div className="space-y-4">
    <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
      <Field label="Fecha"><Input type="date" min={calf.birth_date} max={today()} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      <Field label="Peso (kg)"><Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Ej. 52,5" required /></Field>
      <Button type="submit" loading={saving} aria-label="Agregar pesada">{!saving ? <Plus /> : null}</Button>
    </form>
    {last?.sinceBirth != null && goal ? <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${last.sinceBirth >= 0.8 ? "bg-emerald-100 text-emerald-900" : last.sinceBirth >= goal ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900"}`}>
      Ganancia desde el nacimiento: <strong>{last.sinceBirth.toFixed(2).replace(".", ",")} kg/día</strong>. Para duplicar el peso al nacer a los 60 días necesita {goal.toFixed(2).replace(".", ",")} kg/día; óptimo &gt; 0,8.
    </div> : !birth ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Cargá el peso al nacer (pestaña Datos) para calcular la ganancia diaria.</p> : null}
    {weights === null ? <p className="text-center text-slate-500">Cargando…</p> : !rows.length ? <p className="text-center text-sm text-slate-500">Sin pesadas registradas.</p>
      : <ul className="divide-y divide-[#edf2f0] rounded-xl border border-[#dce5e1]">{[...rows].reverse().map(({ w, age, sinceBirth, sincePrev }) => <li key={w.id} className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1"><p className="font-black">{formatKg(Number(w.weight))} <span className="font-semibold text-slate-500">· {formatDate(w.weighed_at)} · {age} días</span></p>
          <p className="text-xs text-slate-500">{sinceBirth != null ? `${sinceBirth.toFixed(2).replace(".", ",")} kg/d desde nacimiento` : ""}{sincePrev != null ? ` · ${sincePrev.toFixed(2).replace(".", ",")} kg/d desde la pesada anterior` : ""}</p></div>
        <button onClick={() => void remove(w)} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Borrar pesada"><Trash2 className="size-4" /></button>
      </li>)}</ul>}
  </div>;
}

function HealthTab({ calf }: { calf: Calf }) {
  const [treatments, setTreatments] = useState<Treatment[] | null>(null);
  const [plans, setPlans] = useState<(PlanApplication & { protocol: { name: string } | null })[]>([]);
  useEffect(() => {
    void Promise.all([
      supabase.from("simple_guachera_treatments").select("*").eq("calf_id", calf.id).order("start_at", { ascending: false }),
      supabase.from("simple_guachera_plan_applications").select("*, protocol:simple_guachera_protocols(name)").eq("calf_id", calf.id).order("done_at", { ascending: false }),
    ]).then(([t, p]) => { setTreatments((t.data ?? []) as Treatment[]); setPlans((p.data ?? []) as typeof plans); });
  }, [calf.id]);
  if (!treatments) return <p className="text-center text-slate-500">Cargando…</p>;
  return <div className="space-y-4">
    <div><p className="mb-2 text-sm font-black text-slate-700">Tratamientos ({treatments.length})</p>
      {!treatments.length ? <p className="text-sm text-slate-500">Sin tratamientos.</p> : <ul className="space-y-2">{treatments.map((t) => <li key={t.id} className={`rounded-xl border bg-white p-3 ${SEVERITY_STYLE[t.severity ?? "Leve"].card}`}>
        <p className="font-black">{t.protocol_name} <span className="font-semibold text-slate-500">· {t.disease_group} · {t.severity}</span></p>
        <p className="text-sm text-slate-600">{t.product}{t.dose ? ` · ${t.dose}` : ""} · inicio {formatDateTime(t.start_at)}</p>
        <p className="text-sm font-semibold">{t.status === "Activo" ? <span className="text-brand">En curso</span> : <span>{t.outcome}{t.closed_at ? ` · ${formatDateTime(t.closed_at)}` : ""}</span>}{t.withdrawal_until ? <span className="text-slate-500"> · retiro hasta {formatDate(t.withdrawal_until)}</span> : null}</p>
      </li>)}</ul>}
    </div>
    <div><p className="mb-2 text-sm font-black text-slate-700">Plan sanitario</p>
      {!plans.length ? <p className="text-sm text-slate-500">Sin aplicaciones registradas.</p> : <ul className="space-y-1">{plans.map((a) => <li key={a.id} className="text-sm"><span className={a.status === "Aplicada" ? "font-bold text-brand" : "font-bold text-rose-600"}>{a.status}</span> · {a.protocol?.name} · {formatDateTime(a.done_at)}{a.done_by_name ? ` · ${a.done_by_name}` : ""}</li>)}</ul>}
    </div>
  </div>;
}

function ExitTab({ calf, onSaved }: { calf: Calf; onSaved: () => Promise<void> }) {
  const [weanDate, setWeanDate] = useState(calf.weaning_date ?? "");
  const [weanKg, setWeanKg] = useState(str(calf.weaning_weight));
  const [reason, setReason] = useState<ExitReason>(calf.exit_reason ?? "Muerte");
  const [exitDate, setExitDate] = useState(calf.exit_date ?? today());
  const [cause, setCause] = useState(calf.exit_cause);
  const [saving, setSaving] = useState(false);

  async function saveWeaning(event: FormEvent) {
    event.preventDefault();
    const w = parseNum(weanKg);
    if (!weanDate) { toast.error("Indicá la fecha de destete."); return; }
    if (weanDate < calf.birth_date || weanDate > today()) { toast.error("Fecha de destete inválida."); return; }
    if (w !== null && (!Number.isFinite(w) || w <= 0)) { toast.error("Peso de destete inválido."); return; }
    setSaving(true);
    if (await updateCalf(calf.id, { weaning_date: weanDate, weaning_weight: w }, "Destete registrado")) await onSaved();
    setSaving(false);
  }
  async function saveExit(event: FormEvent) {
    event.preventDefault();
    if (exitDate < calf.birth_date || exitDate > today()) { toast.error("Fecha de baja inválida."); return; }
    if (!window.confirm(`¿Dar de baja al ternero ${calf.tag} (${reason})? Deja de aparecer en las listas y tareas.`)) return;
    setSaving(true);
    if (await updateCalf(calf.id, { active: false, exit_reason: reason, exit_date: exitDate, exit_cause: cause.trim() }, `Ternero ${calf.tag} dado de baja`)) await onSaved();
    setSaving(false);
  }
  async function reactivate() {
    setSaving(true);
    if (await updateCalf(calf.id, { active: true, exit_reason: null, exit_date: null, exit_cause: "" }, `Ternero ${calf.tag} reactivado`)) await onSaved();
    setSaving(false);
  }

  return <div className="space-y-5">
    <form onSubmit={saveWeaning} className="space-y-3">
      <p className="text-sm font-black text-slate-700">Destete</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><Input type="date" min={calf.birth_date} max={today()} value={weanDate} onChange={(e) => setWeanDate(e.target.value)} /></Field>
        <Field label="Peso (kg)"><Input inputMode="decimal" value={weanKg} onChange={(e) => setWeanKg(e.target.value)} /></Field>
      </div>
      {calf.weaning_date ? <p className="text-sm text-slate-600">Destetado a los {daysBetween(calf.birth_date, calf.weaning_date)} días{calf.weaning_weight && calf.birth_weight ? `, ${(Number(calf.weaning_weight) / Number(calf.birth_weight)).toFixed(1).replace(".", ",")} veces el peso al nacer` : ""}.</p> : null}
      <SaveRow saving={saving} />
    </form>
    <div className="border-t border-[#edf2f0] pt-4">
      {calf.active ? <form onSubmit={saveExit} className="space-y-3">
        <p className="text-sm font-black text-slate-700">Baja</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Motivo"><Select value={reason} onChange={(e) => setReason(e.target.value as ExitReason)}>{EXIT_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Fecha"><Input type="date" min={calf.birth_date} max={today()} value={exitDate} onChange={(e) => setExitDate(e.target.value)} required /></Field>
        </div>
        <Field label={reason === "Muerte" ? "Causa de muerte" : "Detalle"} hint={reason === "Muerte" ? "Se usa en los indicadores (ej. Diarrea, Neumonía, Septicemia)" : "Opcional"}><Input value={cause} onChange={(e) => setCause(e.target.value)} list="death-causes" /></Field>
        <datalist id="death-causes">{["Diarrea", "Neumonía", "Septicemia", "Onfalitis", "Timpanismo", "Accidente", "Desconocida"].map((c) => <option key={c} value={c} />)}</datalist>
        <div className="flex justify-end"><Button type="submit" variant="danger" loading={saving}>Dar de baja</Button></div>
      </form> : <div className="space-y-3">
        <p className="text-sm text-slate-700"><strong>Baja:</strong> {calf.exit_reason} · {calf.exit_date ? formatDate(calf.exit_date) : ""}{calf.exit_cause ? ` · ${calf.exit_cause}` : ""}</p>
        <Button variant="secondary" onClick={() => void reactivate()} loading={saving}><ArchiveRestore />Reactivar</Button>
      </div>}
    </div>
  </div>;
}
