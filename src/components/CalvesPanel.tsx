import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronRight, Milk, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { CATEGORIES, ageDays, categoryFor, formatAge, formatDate, formatKg, parseNum, today, validateCalf } from "../lib/calves";
import { tpiCategory } from "../lib/indicators";
import { errorText, supabase } from "../lib/supabase";
import type { Calf, CalfInput, Farm } from "../lib/types";
import { BulkCalvesModal } from "./BulkCalvesModal";
import { CalfDetail, ColostrumFields, TPI_STYLE, colostrumValues } from "./CalfDetail";
import { Button, Card, Empty, Field, Input, Modal, Select, Textarea, toast } from "./ui";

type Filter = "todos" | (typeof CATEGORIES)[number]["name"] | "bajas";

export function CalvesPanel({ farm }: { farm: Farm }) {
  const [calves, setCalves] = useState<Calf[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bulk, setBulk] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data, error } = await supabase.from("simple_guachera_calves").select("*").eq("farm_id", farm.id).order("birth_date", { ascending: false });
    setRefreshing(false);
    if (error) { toast.error(errorText(error, "No se pudieron cargar los terneros")); setCalves((c) => c ?? []); return; }
    setCalves(data as Calf[]);
  }, [farm.id]);

  useEffect(() => { void load(); }, [load]);

  const now = today();
  const active = useMemo(() => (calves ?? []).filter((c) => c.active), [calves]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const c of active) { const cat = categoryFor(ageDays(c.birth_date, now)); result.set(cat, (result.get(cat) ?? 0) + 1); }
    return result;
  }, [active, now]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (calves ?? []).filter((c) => {
      if (filter === "bajas" ? c.active : !c.active) return false;
      if (filter !== "todos" && filter !== "bajas" && categoryFor(ageDays(c.birth_date, now)) !== filter) return false;
      return !q || c.tag.toLowerCase().includes(q) || c.location.toLowerCase().includes(q);
    });
  }, [calves, filter, query, now]);

  const archivedCount = (calves ?? []).length - active.length;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Terneros</h1><p className="text-sm text-slate-600">{farm.name}{farm.location ? ` · ${farm.location}` : ""}</p></div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => void load()} aria-label="Actualizar" title="Actualizar"><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button>
        <Button variant="secondary" onClick={() => setBulk(true)} aria-label="Carga masiva" title="Carga masiva"><Upload /><span className="hidden sm:inline">Carga masiva</span></Button>
        <Button onClick={() => setCreating(true)}><Plus />Nuevo ternero</Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Activos" value={active.length} highlight />
      {CATEGORIES.map((c) => <Stat key={c.name} label={c.name} value={counts.get(c.name) ?? 0} hint={`${c.minAgeDays}–${c.maxAgeDays} días`} />)}
    </div>

    <Card className="space-y-3 !p-3 sm:!p-4">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 mt-0.5 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por caravana o ubicación" className="!mt-0 pl-9" aria-label="Buscar" /></div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {(["todos", ...CATEGORIES.map((c) => c.name), ...(archivedCount ? ["bajas" as const] : [])] as Filter[]).map((f) => <button key={f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${filter === f ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{f === "todos" ? "Todos" : f === "bajas" ? `Bajas (${archivedCount})` : f}</button>)}
      </div>
    </Card>

    {calves === null ? <p className="py-10 text-center text-slate-500">Cargando terneros…</p>
      : !calves.length ? <Empty icon={<Milk />} title="Sin terneros cargados" text="Agregá el primer ternero de este establecimiento." action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setCreating(true)}><Plus />Agregar ternero</Button><Button variant="secondary" onClick={() => setBulk(true)}><Upload />Carga masiva</Button></div>} />
      : !visible.length ? <p className="py-10 text-center text-slate-500">No hay terneros que coincidan con el filtro.</p>
      : <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((calf) => {
          const days = ageDays(calf.birth_date, now);
          const tpi = tpiCategory(calf);
          return <li key={calf.id} className="min-w-0">
            <button onClick={() => setOpenId(calf.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#dce5e1] bg-white p-3 text-left shadow-[0_4px_16px_rgba(15,76,58,.05)] hover:border-brand/40">
              <span className={`grid size-12 shrink-0 place-items-center rounded-xl text-sm font-black ${calf.sex === "Hembra" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>{calf.sex === "Hembra" ? "H" : "M"}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate text-lg font-black">{calf.tag}</span>{calf.active ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-dark">{categoryFor(days)}</span> : <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${calf.exit_reason === "Muerte" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{calf.exit_reason ?? "Baja"}</span>}{tpi ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TPI_STYLE[tpi]}`} title="Transferencia de inmunidad pasiva">TIP {tpi}</span> : null}</span>
                <span className="block truncate text-sm text-slate-500">{formatAge(days)} · nac. {formatDate(calf.birth_date)}{calf.birth_weight ? ` · ${formatKg(calf.birth_weight)}` : ""}</span>
                {calf.location ? <span className="block truncate text-xs text-slate-400">{calf.location}</span> : null}
              </span>
              <ChevronRight className="size-5 shrink-0 text-slate-300" />
            </button>
          </li>;
        })}
      </ul>}

    {bulk ? <BulkCalvesModal farm={farm} onClose={() => setBulk(false)} onSaved={async () => { setBulk(false); await load(); }} /> : null}
    {creating ? <NewCalf farmId={farm.id} onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await load(); }} /> : null}
    {openId && calves?.find((c) => c.id === openId) ? <CalfDetail key={openId} calf={calves.find((c) => c.id === openId)!} onClose={() => setOpenId(null)} onChanged={load} /> : null}
  </div>;
}

function Stat({ label, value, hint, highlight }: { label: string; value: number; hint?: string; highlight?: boolean }) {
  return <div className={`rounded-2xl p-3 sm:p-4 ${highlight ? "bg-brand-deep text-white" : "border border-[#dce5e1] bg-white"}`}>
    <p className={`text-xs font-bold uppercase tracking-wide ${highlight ? "text-brand-accent" : "text-slate-500"}`}>{label}</p>
    <p className="mt-1 text-3xl font-black">{value}</p>
    {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
  </div>;
}

function NewCalf({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ tag: "", sex: "Hembra" as CalfInput["sex"], birth_date: today(), birth_weight: "", location: "", notes: "", colostrum_liters: "", colostrum_brix: "", colostrum_hours: "", serum_tp: "", serum_brix: "" });
  const [showColostrum, setShowColostrum] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const values: CalfInput = { tag: form.tag.trim(), sex: form.sex, birth_date: form.birth_date, birth_weight: parseNum(form.birth_weight), location: form.location.trim(), notes: form.notes.trim() };
    const problem = validateCalf(values);
    if (problem) { toast.error(problem); return; }
    const colostrum = colostrumValues(form);
    if (colostrum.error !== undefined) { toast.error(colostrum.error); return; }
    setSaving(true);
    const { error } = await supabase.from("simple_guachera_calves").insert({ ...values, ...colostrum.values, farm_id: farmId });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo guardar")); return; }
    toast.ok(`Ternero ${values.tag} agregado`);
    await onSaved();
  }

  return <Modal title="Nuevo ternero" onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Caravana"><Input value={form.tag} onChange={(e) => set("tag", e.target.value)} placeholder="Ej. 2418" autoFocus required /></Field>
        <Field label="Sexo"><Select value={form.sex} onChange={(e) => set("sex", e.target.value)}><option>Hembra</option><option>Macho</option></Select></Field>
        <Field label="Fecha de nacimiento"><Input type="date" max={today()} value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} required /></Field>
        <Field label="Peso al nacer (kg)"><Input inputMode="decimal" value={form.birth_weight} onChange={(e) => set("birth_weight", e.target.value)} placeholder="Opcional" /></Field>
      </div>
      <Field label="Ubicación" hint="Estaca, sector o corral (opcional)"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Ej. Estaca A-06" /></Field>
      {showColostrum ? <div className="space-y-3 rounded-xl bg-slate-50 p-3"><ColostrumFields form={form} set={set} /></div>
        : <button type="button" onClick={() => setShowColostrum(true)} className="text-sm font-bold text-brand">+ Cargar calostrado</button>}
      <Field label="Observaciones"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Guardar</Button></div>
    </form>
  </Modal>;
}
