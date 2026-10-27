import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Baby, Bandage, Brush, Camera, Check, CheckCircle2, ChevronDown, CircleDot, CircleHelp, ClipboardPen, Droplet, Droplets, Eye, Frown,
  Megaphone, Mic, Milk, Pencil, RefreshCw, Search, ShieldPlus, Square, Trash2, TriangleAlert, Undo2, Volume2, Wheat, Wind, X,
} from "lucide-react";
import { useDayTasks, type DoseRow, type PlanItem } from "../hooks/useDayTasks";
import { formatDate } from "../lib/calves";
import { settingsOf } from "../lib/farmSettings";
import { SEVERITY_ORDER } from "../lib/indicators";
import { MAX_PHOTOS, useObjectUrl, useRecorder } from "../lib/media";
import { SYMPTOMS, greeting, isUrgent, plainInstruction, speak, symptomsText, turnoFor, type SymptomId } from "../lib/plain";
import { sendReport } from "../lib/reports";
import { errorText, supabase } from "../lib/supabase";
import { dayBounds, describePlanDays, formatTime } from "../lib/treatments";
import type { DailyLog, Farm, Report, Severity } from "../lib/types";
import { CameraModal } from "./CameraModal";
import { Button, Modal, Textarea, toast } from "./ui";

type Task = {
  key: string;
  tag: string;
  location: string;
  instruction: string;
  detail: string;
  notes: string;
  level: Severity | "Plan";
  late: boolean;
  due: string;
  dose?: DoseRow;
  plan?: PlanItem;
};

const LEVEL_STYLE: Record<Task["level"], { border: string; badge: string; label: string }> = {
  Grave: { border: "border-rose-500", badge: "bg-rose-600 text-white", label: "Urgente" },
  Moderado: { border: "border-amber-400", badge: "bg-amber-400 text-amber-950", label: "Importante" },
  Leve: { border: "border-emerald-400", badge: "bg-emerald-100 text-emerald-900", label: "Tratamiento" },
  Plan: { border: "border-sky-400", badge: "bg-sky-100 text-sky-900", label: "Vacuna / plan" },
};
const LEVEL_ORDER = (l: Task["level"]) => (l === "Plan" ? 3 : SEVERITY_ORDER[l]);
const SKIP_REASONS = ["No encontré el ternero", "No hay remedio", "El ternero está bien", "Otro motivo"];

/** Pantalla única del operario: qué hacer ahora, con botones grandes y casi nada para escribir. */
export function OperatorHome({ farm, userId, userName }: { farm: Farm; userId: string; userName: string }) {
  const t = useDayTasks(farm);
  const [sheet, setSheet] = useState<null | "avisar" | "anotar">(null);
  const [skipping, setSkipping] = useState<Task | null>(null);
  const [showLater, setShowLater] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [answers, setAnswers] = useState<(Report & { calf: { tag: string } | null })[]>([]);

  const loadAnswers = useCallback(async () => {
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const { data } = await supabase.from("simple_guachera_reports").select("*, calf:simple_guachera_calves(tag)").eq("farm_id", farm.id).eq("created_by", userId).eq("status", "Revisado").gte("diagnosed_at", since).order("diagnosed_at", { ascending: false }).limit(3);
    setAnswers((data ?? []) as typeof answers);
  }, [farm.id, userId]);
  useEffect(() => { void loadAnswers(); }, [loadAnswers]);

  const { now, later } = useMemo(() => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const list: Task[] = [
      ...(t.pending ?? []).map((d): Task => ({
        key: d.id, dose: d, tag: d.calf?.tag ?? "—", location: d.calf?.location ?? "",
        instruction: plainInstruction(d.treatment?.product ?? "", d.treatment?.dose ?? "", d.treatment?.route ?? ""),
        detail: `${d.treatment?.protocol_name ?? "Tratamiento"} · vez ${d.number} de ${d.total}`,
        notes: d.treatment?.notes ?? "", level: d.treatment?.severity ?? "Leve", late: d.due_at < t.start, due: d.due_at,
      })),
      ...t.plan.map((p): Task => ({
        key: `${p.calf.id}|${p.protocol.id}`, plan: p, tag: p.calf.tag, location: p.calf.location,
        instruction: plainInstruction(p.protocol.product, p.protocol.dose, p.protocol.route),
        detail: `${p.protocol.name} · ${describePlanDays(p.protocol.age_day, p.protocol.age_day_to)}`,
        notes: p.protocol.notes, level: "Plan", late: p.until < t.day, due: `${p.due}T00:00:00-03:00`,
      })),
    ];
    const sorted = list.sort((a, b) => Number(b.late) - Number(a.late) || LEVEL_ORDER(a.level) - LEVEL_ORDER(b.level) || a.due.localeCompare(b.due));
    return { now: sorted.filter((x) => x.late || x.plan || x.due <= soon), later: sorted.filter((x) => !x.late && !x.plan && x.due > soon) };
  }, [t.pending, t.plan, t.start, t.day]);

  const doneCount = t.done.length + t.planDone.length;
  const total = doneCount + now.length + later.length;

  async function markDone(task: Task, status: "Aplicada" | "No aplicada", notes = "") {
    if (task.dose) await t.recordDose(task.dose, status, notes);
    else if (task.plan) await t.recordPlan(task.plan.calf.id, task.plan.protocol.id, task.tag, status, notes);
  }

  return <div className="space-y-4 pb-28">
    <section className="rounded-3xl bg-brand-deep p-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-2xl font-black">{greeting()}{userName ? `, ${userName}` : ""}</p><p className="text-emerald-100/80">{formatDate(t.day)} · turno {turnoFor()}</p></div>
        <button onClick={() => { void t.load(); void loadAnswers(); }} className="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Actualizar"><RefreshCw className={`size-5 ${t.refreshing ? "animate-spin" : ""}`} /></button>
      </div>
      {total ? <div className="mt-4">
        <p className="text-lg font-bold">{doneCount} de {total} tareas hechas</p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-brand-accent transition-all" style={{ width: `${(doneCount / total) * 100}%` }} /></div>
      </div> : null}
    </section>

    {answers.map((a) => <div key={a.id} className="flex gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
      <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-700" />
      <div className="min-w-0"><p className="font-black text-emerald-900">Respondieron tu aviso{a.calf ? ` del ternero ${a.calf.tag}` : ""}</p><p className="text-lg text-emerald-950">{a.diagnosis || "Lo revisaron."}</p><p className="text-sm text-emerald-800">{a.diagnosed_by_name}</p></div>
    </div>)}

    {t.pending === null ? <p className="py-10 text-center text-lg text-slate-500">Cargando tus tareas…</p>
      : !now.length ? <div className="rounded-3xl border-2 border-dashed border-emerald-300 bg-white p-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-9" /></span>
        <p className="mt-3 text-2xl font-black">¡Todo listo por ahora!</p>
        <p className="mt-1 text-lg text-slate-600">{later.length ? `Más tarde hay ${later.length} ${later.length === 1 ? "tarea" : "tareas"}.` : "No hay tratamientos pendientes."}</p>
      </div>
      : <section className="space-y-3">
        <h2 className="text-xl font-black">Para hacer ahora <span className="text-slate-500">({now.length})</span></h2>
        <ul className="space-y-3">{now.map((task) => <TaskCard key={task.key} task={task} busy={t.busy === task.key} onDone={() => void markDone(task, "Aplicada")} onSkip={() => setSkipping(task)} />)}</ul>
      </section>}

    {later.length ? <section>
      <button onClick={() => setShowLater((v) => !v)} className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-lg font-bold">Más tarde hoy ({later.length})<ChevronDown className={`size-5 transition ${showLater ? "rotate-180" : ""}`} /></button>
      {showLater ? <ul className="mt-2 space-y-2">{later.map((task) => <li key={task.key} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"><span className="text-lg font-black text-slate-700">{formatTime(task.due)}</span><span className="text-2xl font-black">{task.tag}</span><span className="min-w-0 flex-1 truncate text-slate-600">{task.instruction}</span></li>)}</ul> : null}
    </section> : null}

    {doneCount ? <section>
      <button onClick={() => setShowDone((v) => !v)} className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-lg font-bold text-emerald-800">Hechas hoy ({doneCount})<ChevronDown className={`size-5 transition ${showDone ? "rotate-180" : ""}`} /></button>
      {showDone ? <ul className="mt-2 space-y-2">
        {t.done.map((d) => <DoneRow key={d.id} tag={d.calf?.tag ?? ""} what={d.treatment?.product ?? ""} ok={d.status === "Aplicada"} at={d.done_at} canUndo={d.done_by === userId} onUndo={() => void t.recordDose(d, "Pendiente")} />)}
        {t.planDone.map((a) => <DoneRow key={a.id} tag={a.calf?.tag ?? ""} what={a.protocol?.product ?? a.protocol?.name ?? ""} ok={a.status === "Aplicada"} at={a.done_at} canUndo={a.done_by === userId} onUndo={() => void t.recordPlan(a.calf_id, a.protocol_id, a.calf?.tag ?? "", "Pendiente")} />)}
      </ul> : null}
    </section> : null}

    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dce5e1] bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3">
        <button onClick={() => setSheet("avisar")} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-rose-600 text-base font-black text-white shadow-lg active:scale-[.98] sm:text-lg"><Megaphone className="size-6 shrink-0" />Avisar problema</button>
        <button onClick={() => setSheet("anotar")} className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-brand text-base font-black text-white shadow-lg active:scale-[.98] sm:text-lg"><ClipboardPen className="size-6 shrink-0" />Anotar tarea</button>
      </div>
    </div>

    {skipping ? <Modal title={`¿Por qué no se pudo? · ${skipping.tag}`} onClose={() => setSkipping(null)}>
      <div className="grid gap-2">{SKIP_REASONS.map((r) => <button key={r} onClick={() => { const task = skipping; setSkipping(null); void markDone(task, "No aplicada", r); }} className="rounded-2xl bg-slate-100 px-4 py-4 text-left text-lg font-bold active:bg-slate-200">{r}</button>)}</div>
    </Modal> : null}
    {sheet === "avisar" ? <ReportWizard farm={farm} pendingTags={new Set([...now, ...later].map((x) => x.tag))} onClose={() => setSheet(null)} /> : null}
    {sheet === "anotar" ? <QuickLog farm={farm} pendingTags={new Set([...now, ...later].map((x) => x.tag))} onClose={() => setSheet(null)} /> : null}
  </div>;
}

function TaskCard({ task, busy, onDone, onSkip }: { task: Task; busy: boolean; onDone: () => void; onSkip: () => void }) {
  const s = LEVEL_STYLE[task.level];
  const when = task.late ? "Atrasada" : task.plan ? "Hoy" : formatTime(task.due);
  const say = () => { if (!speak(`Ternero ${task.tag}. ${task.instruction.replaceAll(" · ", ". ")}. ${task.notes}`)) toast.error("Este celular no puede leer en voz alta."); };
  return <li className={`rounded-3xl border-2 border-l-[10px] bg-white p-4 shadow-[0_6px_20px_rgba(15,76,58,.08)] ${s.border}`}>
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${s.badge}`}>{task.plan ? <ShieldPlus className="mr-1 inline size-3.5" /> : null}{s.label}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${task.late ? "bg-amber-200 text-amber-950" : "bg-slate-100 text-slate-700"}`}>{when}</span>
        </div>
        <p className="mt-2 text-5xl font-black leading-none tracking-tight">{task.tag}</p>
        {task.location ? <p className="mt-1 text-lg font-semibold text-slate-600">{task.location}</p> : null}
      </div>
      <button onClick={say} className="grid size-14 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 active:bg-slate-200" aria-label="Escuchar la tarea"><Volume2 className="size-7" /></button>
    </div>
    <p className="mt-3 text-xl font-bold leading-snug text-ink">{task.instruction || task.detail}</p>
    <p className="text-slate-500">{task.detail}</p>
    {task.notes ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-lg text-amber-950">{task.notes}</p> : null}
    <button onClick={onDone} disabled={busy} className="mt-4 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand text-2xl font-black text-white shadow active:scale-[.98] disabled:opacity-60">
      {busy ? <RefreshCw className="size-7 animate-spin" /> : <Check className="size-8" />}HECHO
    </button>
    <button onClick={onSkip} disabled={busy} className="mt-2 w-full py-2 text-lg font-semibold text-slate-500 underline">No pude hacerlo</button>
  </li>;
}

function DoneRow({ tag, what, ok, at, canUndo, onUndo }: { tag: string; what: string; ok: boolean; at: string | null; canUndo: boolean; onUndo: () => void }) {
  return <li className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{ok ? <Check className="size-5" /> : <X className="size-5" />}</span>
    <span className="text-xl font-black">{tag}</span><span className="min-w-0 flex-1 truncate text-slate-600">{what}{at ? ` · ${formatTime(at)}` : ""}</span>
    {canUndo ? <button onClick={onUndo} className="grid size-10 place-items-center rounded-xl text-slate-500" aria-label={`Deshacer ${tag}`}><Undo2 className="size-5" /></button> : null}
  </li>;
}

type CalfOption = { id: string; tag: string };

/** Grilla de caravanas grandes con búsqueda por número. Con `selected` permite elegir varios. */
function CalfGrid({ calves, pendingTags, selected, onPick }: { calves: CalfOption[] | null; pendingTags: Set<string>; selected?: Set<string>; onPick: (calf: CalfOption) => void }) {
  const [search, setSearch] = useState("");
  const list = (calves ?? []).filter((c) => !search.trim() || c.tag.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(pendingTags.has(b.tag)) - Number(pendingTags.has(a.tag)) || a.tag.localeCompare(b.tag, "es", { numeric: true }));
  return <>
    <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} inputMode="numeric" placeholder="Buscar número" className="h-16 w-full rounded-2xl border-2 border-[#cedad5] bg-white pl-14 pr-4 text-2xl font-bold outline-none focus:border-brand" aria-label="Buscar número de caravana" /></div>
    {calves === null ? <p className="text-lg text-slate-500">Cargando…</p> : <div className="grid grid-cols-3 gap-2">
      {list.slice(0, 90).map((c) => { const on = selected?.has(c.id) ?? false; return <button key={c.id} onClick={() => onPick(c)} aria-pressed={selected ? on : undefined}
        className={`relative h-16 rounded-2xl border-4 text-2xl font-black shadow-sm ${on ? "border-brand bg-brand-soft text-brand-dark" : "border-transparent bg-white active:bg-brand-soft"}`}>
        {c.tag}{on ? <Check className="absolute left-1.5 top-1.5 size-4 text-brand" /> : null}{pendingTags.has(c.tag) ? <span className="absolute right-2 top-2 size-2.5 rounded-full bg-rose-500" /> : null}
      </button>; })}
      {!list.length ? <p className="col-span-3 text-lg text-slate-500">No hay un ternero con ese número.</p> : null}
    </div>}
  </>;
}

/** Terneros activos del establecimiento (para elegir caravana). */
function useCalfOptions(farmId: string) {
  const [calves, setCalves] = useState<CalfOption[] | null>(null);
  useEffect(() => {
    void supabase.from("simple_guachera_calves").select("id,tag").eq("farm_id", farmId).eq("active", true).order("tag").then(({ data }) => setCalves((data ?? []) as CalfOption[]));
  }, [farmId]);
  return calves;
}

const SYMPTOM_ICON: Record<SymptomId, React.ReactNode> = {
  diarrea: <Droplets />, respira: <Wind />, notoma: <Milk />, caido: <TriangleAlert />, decaido: <Frown />, ombligo: <CircleDot />, lastimado: <Bandage />, otro: <CircleHelp />,
};

/** Avisar un problema en tres pasos: ternero → qué le pasa → foto o audio. */
function ReportWizard({ farm, pendingTags, onClose }: { farm: Farm; pendingTags: Set<string>; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const calves = useCalfOptions(farm.id);
  const [calf, setCalf] = useState<CalfOption | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomId[]>([]);
  const [urgentManual, setUrgentManual] = useState(false);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [extra, setExtra] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sending, setSending] = useState(false);
  const audio = useRecorder();
  const audioUrl = useObjectUrl(audio.blob);
  const urgent = isUrgent(symptoms) || urgentManual;


  async function send() {
    if (audio.recording) audio.stop();
    setSending(true);
    const notes = [symptomsText(symptoms), extra.trim()].filter(Boolean).join(". ") || (symptoms.includes("otro") ? "Otra cosa (ver foto o audio)" : "");
    const problem = await sendReport({ farmId: farm.id, calfId: calf?.id ?? null, notes, urgent, photos, audio: audio.blob });
    setSending(false);
    if (problem) { toast.error(problem); return; }
    setStep(4);
  }

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-canvas" role="dialog" aria-modal="true" aria-label="Avisar un problema">
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-32">
      <div className="flex items-center gap-3">
        {step > 1 && step < 4 ? <button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} className="grid size-12 place-items-center rounded-full bg-white" aria-label="Atrás"><ArrowLeft className="size-6" /></button> : null}
        <p className="flex-1 text-lg font-bold text-slate-500">{step < 4 ? `Paso ${step} de 3` : ""}</p>
        <button onClick={onClose} className="grid size-12 place-items-center rounded-full bg-white" aria-label="Cerrar"><X className="size-6" /></button>
      </div>

      {step === 1 ? <>
        <h2 className="text-3xl font-black">¿Qué ternero?</h2>
        <CalfGrid calves={calves} pendingTags={pendingTags} onPick={(c) => { setCalf(c); setStep(2); }} />
        <button onClick={() => { setCalf(null); setStep(2); }} className="h-16 w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white text-lg font-bold text-slate-600">No sé / son varios terneros</button>
      </> : null}

      {step === 2 ? <>
        <h2 className="text-3xl font-black">¿Qué le pasa{calf ? ` al ${calf.tag}` : ""}?</h2>
        <p className="text-lg text-slate-600">Tocá todo lo que veas.</p>
        <div className="grid grid-cols-2 gap-3">{SYMPTOMS.map((s) => { const on = symptoms.includes(s.id); return <button key={s.id} onClick={() => setSymptoms((list) => (on ? list.filter((x) => x !== s.id) : [...list, s.id]))}
          className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-4 p-3 text-center text-lg font-black [&_svg]:size-8 ${on ? (s.urgent ? "border-rose-600 bg-rose-50 text-rose-800" : "border-brand bg-brand-soft text-brand-dark") : "border-transparent bg-white text-slate-700"}`} aria-pressed={on}>{SYMPTOM_ICON[s.id]}{s.label}</button>; })}</div>
        {urgent ? <p className="flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-lg font-black text-white"><TriangleAlert className="size-6" />Se va a avisar como URGENTE</p>
          : <button onClick={() => setUrgentManual(true)} className="w-full rounded-2xl bg-white px-4 py-3 text-lg font-bold text-rose-700">Es urgente</button>}
        <button disabled={!symptoms.length} onClick={() => setStep(3)} className="h-16 w-full rounded-2xl bg-brand text-2xl font-black text-white disabled:opacity-40">Siguiente</button>
      </> : null}

      {step === 3 ? <>
        <h2 className="text-3xl font-black">Mostralo</h2>
        <p className="text-lg text-slate-600">Una foto o un audio ayudan mucho (no es obligatorio).</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setCamera(true)} disabled={photos.length >= MAX_PHOTOS} className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black disabled:opacity-40"><Camera className="size-9" />Sacar foto</button>
          {audio.recording ? <button onClick={audio.stop} className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-rose-600 text-lg font-black text-white"><Square className="size-9" />Parar · {Math.floor(audio.seconds / 60)}:{String(audio.seconds % 60).padStart(2, "0")}</button>
            : <button onClick={() => void audio.start()} disabled={!audio.supported} className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black disabled:opacity-40"><Mic className="size-9" />{audio.blob ? "Grabar de nuevo" : "Grabar audio"}</button>}
        </div>
        {audio.error ? <p className="text-lg text-rose-700">{audio.error}</p> : null}
        {photos.length ? <div className="flex flex-wrap gap-2">{photos.map((p, i) => <Thumb key={i} blob={p} onRemove={() => setPhotos((list) => list.filter((x) => x !== p))} />)}</div> : null}
        {audioUrl ? <div className="flex items-center gap-2"><audio controls src={audioUrl} className="w-full" /><button onClick={audio.reset} className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-slate-500" aria-label="Borrar audio"><Trash2 className="size-5" /></button></div> : null}
        {showExtra ? <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} placeholder="Escribí algo más (opcional)" className="text-lg" aria-label="Algo más" />
          : <button onClick={() => setShowExtra(true)} className="flex items-center gap-2 text-lg font-bold text-slate-600"><Pencil className="size-5" />Escribir algo más</button>}
        <div className="rounded-2xl bg-white p-4 text-lg"><p className="font-black">{calf ? `Ternero ${calf.tag}` : "Sin ternero elegido"}{urgent ? <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-sm text-white">URGENTE</span> : null}</p><p className="text-slate-700">{symptomsText(symptoms) || "Otra cosa"}</p></div>
        <button onClick={() => void send()} disabled={sending} className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-rose-600 text-2xl font-black text-white shadow-lg disabled:opacity-60">{sending ? <RefreshCw className="size-7 animate-spin" /> : <Megaphone className="size-8" />}{sending ? "Enviando…" : "ENVIAR AVISO"}</button>
        {camera ? <CameraModal remaining={MAX_PHOTOS - photos.length} onClose={() => setCamera(false)} onFallback={() => setCamera(false)} onShot={(blob) => setPhotos((list) => (list.length >= MAX_PHOTOS ? list : [...list, blob]))} /> : null}
      </> : null}

      {step === 4 ? <div className="space-y-5 pt-10 text-center">
        <span className="mx-auto grid size-24 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-14" /></span>
        <h2 className="text-3xl font-black">¡Aviso enviado!</h2>
        <p className="text-xl text-slate-600">{urgent ? "Lo marcamos como urgente." : ""} El productor o el veterinario lo va a revisar y vas a ver la respuesta en tu pantalla.</p>
        <Button onClick={onClose} className="!h-16 w-full !text-2xl">Listo</Button>
      </div> : null}
    </div>
  </div>;
}

function Thumb({ blob, onRemove }: { blob: Blob; onRemove: () => void }) {
  const url = useObjectUrl(blob);
  return <div className="relative">{url ? <img src={url} alt="Foto" className="size-24 rounded-2xl object-cover" /> : null}
    <button onClick={onRemove} className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full bg-ink text-white" aria-label="Quitar foto"><X className="size-4" /></button></div>;
}

const LOG_ICONS: [RegExp, React.ReactNode][] = [
  [/aliment|leche/i, <Milk key="m" />], [/iniciador|balanceado|alimento seco/i, <Wheat key="w" />], [/agua/i, <Droplet key="d" />],
  [/limpi|cama/i, <Brush key="b" />], [/calostr/i, <Baby key="c" />], [/observ/i, <Eye key="e" />],
];

/** Anotar una tarea: qué se hizo → para qué terneros (uno, varios o todos). El turno se completa solo. */
function QuickLog({ farm, pendingTags, onClose }: { farm: Farm; pendingTags: Set<string>; onClose: () => void }) {
  const kinds = settingsOf(farm).logKinds;
  const calves = useCalfOptions(farm.id);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [kind, setKind] = useState<string | null>(null);
  const [step, setStep] = useState<"tarea" | "terneros" | "detalle">("tarea");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allCalves, setAllCalves] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const turno = turnoFor();
  const needsText = (k: string) => /otro|observ/i.test(k);

  const load = useCallback(async () => {
    const { start, end } = dayBounds(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
    const { data } = await supabase.from("simple_guachera_daily_logs").select("*").eq("farm_id", farm.id).gte("done_at", start).lte("done_at", end).order("done_at", { ascending: false });
    setLogs((data ?? []) as DailyLog[]);
  }, [farm.id]);
  useEffect(() => { void load(); }, [load]);

  function chooseKind(k: string) { setKind(k); setPicked(new Set()); setAllCalves(false); setText(""); setStep("terneros"); }
  function next(everyone: boolean) {
    setAllCalves(everyone);
    if (needsText(kind!)) setStep("detalle"); else void save(everyone, "");
  }

  async function save(everyone = allCalves, detail = text) {
    if (!kind) return;
    setSaving(true);
    const notes = [`Turno ${turno}`, everyone ? "Todos los terneros" : "", detail.trim()].filter(Boolean).join(". ");
    const rows: { farm_id: string; kind: string; notes: string; calf_id: string | null }[] = everyone || !picked.size ? [{ farm_id: farm.id, kind, notes, calf_id: null }] : [...picked].map((id) => ({ farm_id: farm.id, kind, notes, calf_id: id }));
    const { error } = await supabase.from("simple_guachera_daily_logs").insert(rows);
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo anotar")); return; }
    toast.ok(`Anotado: ${kind}${everyone ? " · todos" : rows.length > 1 ? ` · ${rows.length} terneros` : calves?.find((c) => c.id === rows[0].calf_id) ? ` · ${calves.find((c) => c.id === rows[0].calf_id)!.tag}` : ""}`);
    setKind(null); setStep("tarea");
    await load();
  }

  const togglePick = (c: CalfOption) => setPicked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
  const tagOf = (id: string | null) => calves?.find((c) => c.id === id)?.tag;

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-canvas" role="dialog" aria-modal="true" aria-label="Anotar tarea">
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-36">
      <div className="flex items-center gap-3">
        {step !== "tarea" ? <button onClick={() => setStep(step === "detalle" ? "terneros" : "tarea")} className="grid size-12 place-items-center rounded-full bg-white" aria-label="Atrás"><ArrowLeft className="size-6" /></button> : null}
        <p className="flex-1 text-lg font-bold text-slate-500">Turno {turno}</p>
        <button onClick={onClose} className="grid size-12 place-items-center rounded-full bg-white" aria-label="Cerrar"><X className="size-6" /></button>
      </div>

      {step === "tarea" ? <>
        <h2 className="text-3xl font-black">¿Qué hiciste?</h2>
        <div className="grid grid-cols-2 gap-3">{kinds.map((k) => {
          const done = logs.filter((l) => l.kind === k && l.notes.startsWith(`Turno ${turno}`));
          const general = done.some((l) => !l.calf_id);
          const tags = [...new Set(done.map((l) => tagOf(l.calf_id)).filter(Boolean))];
          return <button key={k} onClick={() => chooseKind(k)}
            className={`flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-4 p-3 text-center text-lg font-black [&_svg]:size-8 ${done.length ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-transparent bg-white text-slate-800"}`}>
            {LOG_ICONS.find(([re]) => re.test(k))?.[1] ?? <ClipboardPen />}{k}
            {done.length ? <span className="flex items-center gap-1 text-sm font-bold text-emerald-700"><Check className="!size-4" />{general ? "Todos" : tags.length > 2 ? `${tags.length} terneros` : tags.join(", ")} · {formatTime(done[0].done_at)}</span> : null}
          </button>;
        })}</div>
      </> : null}

      {step === "terneros" && kind ? <>
        <h2 className="text-3xl font-black">¿Para qué ternero?</h2>
        <p className="flex items-center gap-2 text-lg font-bold text-brand-dark [&_svg]:size-6">{LOG_ICONS.find(([re]) => re.test(kind))?.[1] ?? <ClipboardPen />}{kind}</p>
        <button onClick={() => next(true)} disabled={saving} className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-brand-deep text-xl font-black text-white disabled:opacity-60">{saving && allCalves ? <RefreshCw className="size-6 animate-spin" /> : <CheckCircle2 className="size-6" />}Todos los terneros</button>
        <p className="text-lg text-slate-600">O tocá uno o varios:</p>
        <CalfGrid calves={calves} pendingTags={pendingTags} selected={picked} onPick={togglePick} />
        <div className="fixed inset-x-0 bottom-0 border-t border-[#dce5e1] bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-xl"><button onClick={() => next(false)} disabled={!picked.size || saving} className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-xl font-black text-white disabled:opacity-40">
            {saving ? <RefreshCw className="size-6 animate-spin" /> : <Check className="size-7" />}{picked.size ? `Anotar para ${picked.size === 1 ? `el ${tagOf([...picked][0])}` : `${picked.size} terneros`}` : "Elegí los terneros"}
          </button></div>
        </div>
      </> : null}

      {step === "detalle" && kind ? <>
        <h2 className="text-3xl font-black">{kind}</h2>
        <p className="text-lg text-slate-600">{allCalves ? "Todos los terneros" : [...picked].map(tagOf).join(", ")}</p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Contá en pocas palabras" className="text-lg" autoFocus aria-label="Detalle" />
        <button onClick={() => void save()} disabled={!text.trim() || saving} className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-xl font-black text-white disabled:opacity-40">{saving ? <RefreshCw className="size-6 animate-spin" /> : <Check className="size-7" />}Anotar</button>
      </> : null}
    </div>
  </div>;
}
