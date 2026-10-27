import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { addDays, formatDate, today } from "../lib/calves";
import { TPI_CATEGORIES, TPI_TARGET, computeIndicators, level, type Indicators, type Level } from "../lib/indicators";
import { errorText, supabase } from "../lib/supabase";
import type { Calf, Dose, Farm, Treatment, Weight } from "../lib/types";
import { Button, Card, Input, toast } from "./ui";

type Data = { calves: Calf[]; weights: Weight[]; treatments: Treatment[]; doses: Pick<Dose, "status" | "due_at">[] };
const PRESETS = [
  { id: "30", label: "30 días", days: 30 },
  { id: "90", label: "90 días", days: 90 },
  { id: "365", label: "12 meses", days: 365 },
  { id: "custom", label: "Elegir fechas", days: 0 },
] as const;

const LEVEL_STYLE: Record<Level, { card: string; value: string; chip: string; label: string }> = {
  ok: { card: "border-emerald-200 bg-emerald-50/60", value: "text-emerald-700", chip: "bg-emerald-600 text-white", label: "En meta" },
  warn: { card: "border-amber-200 bg-amber-50/70", value: "text-amber-700", chip: "bg-amber-400 text-amber-950", label: "Atención" },
  bad: { card: "border-rose-200 bg-rose-50/70", value: "text-rose-700", chip: "bg-rose-600 text-white", label: "Fuera de meta" },
  none: { card: "border-[#dce5e1] bg-white", value: "text-slate-800", chip: "bg-slate-200 text-slate-600", label: "Sin datos" },
};
const TPI_BAR: Record<string, string> = { Excelente: "bg-emerald-600", Buena: "bg-emerald-300", Regular: "bg-amber-400", Pobre: "bg-rose-600" };

const fmt = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits).replace(".", ","));

export function IndicatorsPanel({ farm }: { farm: Farm }) {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("90");
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(`${addDays(from, -120)}T00:00:00-03:00`).toISOString();
    const until = new Date(`${to}T23:59:59-03:00`).toISOString();
    const [c, w, t, d] = await Promise.all([
      supabase.from("simple_guachera_calves").select("*").eq("farm_id", farm.id).lte("birth_date", to),
      supabase.from("simple_guachera_weights").select("calf_id,weighed_at,weight").eq("farm_id", farm.id).gte("weighed_at", from).lte("weighed_at", to),
      supabase.from("simple_guachera_treatments").select("calf_id,start_at,disease_group,status,outcome,closed_at").eq("farm_id", farm.id).gte("start_at", since).lte("start_at", until),
      supabase.from("simple_guachera_doses").select("status,due_at").eq("farm_id", farm.id).gte("due_at", new Date(`${from}T00:00:00-03:00`).toISOString()).lte("due_at", until),
    ]);
    setLoading(false);
    const error = c.error ?? w.error ?? t.error ?? d.error;
    if (error) { toast.error(errorText(error, "No se pudieron calcular los indicadores")); return; }
    setData({ calves: c.data as Calf[], weights: w.data as Weight[], treatments: t.data as Treatment[], doses: d.data as Data["doses"] });
  }, [farm.id, from, to]);
  useEffect(() => { void load(); }, [load]);

  const r = useMemo(() => (data ? computeIndicators({ ...data, from, to }) : null), [data, from, to]);

  function pick(id: (typeof PRESETS)[number]["id"]) {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id)!;
    if (p.days) { setFrom(addDays(today(), -p.days)); setTo(today()); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Indicadores</h1><p className="text-sm text-slate-600">{farm.name} · {formatDate(from)} al {formatDate(to)}</p></div>
      <Button variant="ghost" onClick={() => void load()} aria-label="Actualizar" title="Actualizar"><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => <button key={p.id} onClick={() => pick(p.id)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${preset === p.id ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{p.label}</button>)}
      {preset === "custom" ? <div className="flex w-full gap-2 pt-1 sm:w-auto sm:pt-0">
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="!mt-0" aria-label="Desde" />
        <Input type="date" value={to} min={from} max={today()} onChange={(e) => e.target.value && setTo(e.target.value)} className="!mt-0" aria-label="Hasta" />
      </div> : null}
    </div>

    {!r ? <p className="py-10 text-center text-slate-500">Calculando…</p> : <Body r={r} />}
  </div>;
}

function Body({ r }: { r: Indicators }) {
  const poor = r.tpi.share.find((s) => s.category === "Pobre")!.value;
  return <>
    <p className="text-sm text-slate-600"><strong>{r.atRisk}</strong> terneros pasaron por guachera (1–60 días) en el período · <strong>{r.born}</strong> nacidos.</p>

    <Group title="Sanidad">
      <Tile title="Mortalidad 1–60 días" value={`${fmt(r.mortality.value)} %`} lvl={level(r.mortality.value, 5, 10, "max")} target="Meta < 5 % (DCHA)" detail={`${r.mortality.deaths} muertes${r.mortality.deaths24h ? ` · ${r.mortality.deaths24h} en las primeras 24 h (no se cuentan)` : ""}${r.mortality.later ? ` · ${r.mortality.later} después de 60 días` : ""}`} />
      <Tile title="Morbilidad por diarrea" value={`${fmt(r.diarrhea.value)} %`} lvl={level(r.diarrhea.value, 25, 35, "max")} target="Meta < 25 % (DCHA)" detail={`${r.diarrhea.calves} terneros tratados`} />
      <Tile title="Morbilidad respiratoria" value={`${fmt(r.respiratory.value)} %`} lvl={level(r.respiratory.value, 10, 15, "max")} target="Meta < 10 % (DCHA)" detail={`${r.respiratory.calves} terneros tratados`} />
      <Tile title="Terneros retratados" value={String(r.retreated)} lvl={r.treated ? level((r.retreated / r.treated) * 100, 10, 20, "max") : "none"} target="Más de un tratamiento en el período · meta sugerida < 10 % de los tratados" detail={`${r.treated} terneros con algún tratamiento · ${r.navel.calves} por ombligo`} />
      <Tile title="Recuperados al cerrar" value={`${fmt(r.recovered.value, 0)} %`} lvl={level(r.recovered.value, 85, 70, "min")} target="Meta sugerida ≥ 85 %" detail={`${r.recovered.closed} tratamientos cerrados`} />
      <Tile title="Dosis aplicadas" value={`${fmt(r.doses.applied, 0)} %`} lvl={level(r.doses.applied, 95, 85, "min")} target="Meta sugerida ≥ 95 %" detail={`${r.doses.due} dosis vencidas · ${r.doses.missed} no aplicadas · ${r.doses.late} sin registrar`} />
    </Group>

    <Group title="Calostrado e inmunidad">
      <Tile title="Inmunidad pasiva pobre" value={`${fmt(poor)} %`} lvl={level(poor, 10, 20, "max")} target="Meta < 10 % (Lombard 2020)" detail={`${r.tpi.measured} terneros medidos · ${fmt(r.tpi.coverage, 0)} % de los nacidos`} />
      <Tile title="Calostrado correcto" value={`${fmt(r.colostrum.ok, 0)} %`} lvl={level(r.colostrum.ok, 90, 75, "min")} target="≥ 4 L y ≥ 22 % Brix (INIA) · meta sugerida ≥ 90 %" detail={`${r.colostrum.recorded} terneros con calostrado registrado`} />
      <Tile title="Calostro en las primeras 2 h" value={`${fmt(r.colostrum.early, 0)} %`} lvl={level(r.colostrum.early, 90, 75, "min")} target="Lo antes posible · meta sugerida ≥ 90 %" detail="Sobre los terneros con hora registrada" />
    </Group>
    <Card>
      <p className="font-black">Transferencia de inmunidad pasiva</p>
      <p className="text-sm text-slate-500">Nacidos en el período con proteína total o Brix en suero. Metas de rodeo según Lombard et al. 2020.</p>
      {r.tpi.measured ? <>
        <div className="mt-3 flex h-6 overflow-hidden rounded-full bg-slate-100">{r.tpi.share.filter((s) => s.count).map((s) => <div key={s.category} className={TPI_BAR[s.category]} style={{ width: `${s.value}%` }} title={`${s.category}: ${fmt(s.value, 0)} %`} />)}</div>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{TPI_CATEGORIES.map((k) => { const s = r.tpi.share.find((x) => x.category === k)!; return <li key={k} className="rounded-xl bg-slate-50 px-3 py-2"><p className="flex items-center gap-1.5 text-sm font-bold"><span className={`size-2.5 rounded-full ${TPI_BAR[k]}`} />{k}</p><p className="text-xl font-black">{fmt(s.value, 0)} %</p><p className="text-xs text-slate-500">{s.count} terneros · meta {TPI_TARGET[k]}</p></li>; })}</ul>
      </> : <p className="mt-3 text-sm text-slate-500">Sin mediciones. Cargá proteína total o Brix en suero en la ficha del ternero o desde Carga masiva.</p>}
    </Card>

    <Group title="Crecimiento y destete">
      <Tile title="Ganancia diaria predestete" value={`${fmt(r.gdp.value, 2)} kg/d`} lvl={level(r.gdp.value, 0.8, 0.65, "min")} target="Óptimo > 0,8 kg/día" detail={`${r.gdp.calves} terneros pesados entre 14 y 75 días`} />
      <Tile title="Encaminados a duplicar el peso al nacer a los 60 días" value={`${fmt(r.gdp.doubling, 0)} %`} lvl={level(r.gdp.doubling, 90, 70, "min")} target="Estándar DCHA · meta sugerida ≥ 90 % de los terneros" detail="Ganancia ≥ peso al nacer ÷ 60" />
      <Tile title="Destetes" value={String(r.weaning.count)} lvl="none" target="En el período" detail={r.weaning.count ? `Edad promedio ${fmt(r.weaning.age, 0)} días${r.weaning.weight !== null ? ` · peso promedio ${fmt(r.weaning.weight, 0)} kg` : ""}` : "Sin destetes registrados"} />
    </Group>

    {r.mortality.causes.length ? <Card>
      <p className="font-black">Causas de muerte</p>
      <ul className="mt-2 space-y-1.5">{r.mortality.causes.map(([cause, n]) => { const total = r.mortality.causes.reduce((a, [, x]) => a + x, 0); return <li key={cause} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm"><span className="font-semibold">{cause}</span><span className="font-black">{n}</span><span className="col-span-2 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-rose-500" style={{ width: `${(n / total) * 100}%` }} /></span></li>; })}</ul>
    </Card> : null}

    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">{(["ok", "warn", "bad", "none"] as Level[]).map((l) => <span key={l} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${LEVEL_STYLE[l].chip}`} />{LEVEL_STYLE[l].label}</span>)}</div>
    <p className="text-xs leading-5 text-slate-500">
      Referencias: <a className="underline" href="https://www.vitaplus.com/starting-strong-calf-care/meeting-the-gold-standards/" target="_blank" rel="noreferrer">DCHA Gold Standards</a> (mortalidad, morbilidad, duplicar peso a 60 días) ·{" "}
      <a className="underline" href="https://dairy.extension.wisc.edu/files/2023/01/Heifer-Blueprint-Passive-Transfer-English-new-logo.pdf" target="_blank" rel="noreferrer">Lombard et al. 2020</a> (inmunidad pasiva) ·{" "}
      <a className="underline" href="https://inia.uy/sites/default/files/publications/2024-10/Revista-INIA-57-Junio-2019-p.33-35.pdf" target="_blank" rel="noreferrer">INIA</a> (calostrado) ·{" "}
      <a className="underline" href="https://www.engormix.com/lecheria/nutricion-terneras/nutricion-lactea-optimizar-crecimiento_a57015/" target="_blank" rel="noreferrer">Engormix</a> (ganancia diaria). Las “metas sugeridas” son orientativas y se pueden ajustar.
    </p>
  </>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="text-sm font-black uppercase tracking-wide text-slate-600">{title}</h2><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div></section>;
}

function Tile({ title, value, lvl, target, detail }: { title: string; value: string; lvl: Level; target: string; detail: string }) {
  const s = LEVEL_STYLE[lvl];
  return <div className={`rounded-2xl border p-4 ${s.card}`}>
    <div className="flex items-start justify-between gap-2"><p className="text-sm font-bold text-slate-700">{title}</p>{lvl !== "none" || value.includes("—") ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${s.chip}`}>{s.label}</span> : null}</div>
    <p className={`mt-1 text-3xl font-black ${s.value}`}>{value}</p>
    <p className="text-xs font-semibold text-slate-600">{target}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}
