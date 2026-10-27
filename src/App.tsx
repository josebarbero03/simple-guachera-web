import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Building2, CalendarCheck, ChartColumn, Upload, ClipboardList, FileText, KeyRound, LoaderCircle, LogOut, Menu, Milk, Stethoscope, Users } from "lucide-react";
import { AuthScreen, Brand } from "./components/AuthScreen";
import { CalvesPanel } from "./components/CalvesPanel";
import { BulkImport } from "./components/BulkImport";
import { FarmsPanel } from "./components/FarmsPanel";
import { IndicatorsPanel } from "./components/IndicatorsPanel";
import { LogPanel } from "./components/LogPanel";
import { ProtocolsPanel } from "./components/ProtocolsPanel";
import { TeamPanel } from "./components/TeamPanel";
import { TodayPanel } from "./components/TodayPanel";
import { TreatmentsPanel } from "./components/TreatmentsPanel";
import { Button, Field, Input, Toaster, toast } from "./components/ui";
import { errorText, supabase } from "./lib/supabase";
import { ROLE_LABEL, isManager } from "./lib/roles";
import type { Farm, Role } from "./lib/types";

const FARM_KEY = "simple-guachera-farm";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(next);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <>
    <Toaster />
    {loading ? <Loading text="Preparando el acceso…" />
      : recovering && session ? <NewPassword onDone={() => setRecovering(false)} />
      : session ? <Shell session={session} />
      : <AuthScreen />}
  </>;
}

type Tab = "hoy" | "registro" | "terneros" | "tratamientos" | "indicadores" | "carga" | "protocolos" | "equipo" | "establecimientos" | "mas";
type TabDef = { id: Tab; label: string; short?: string; icon: React.ReactNode };

const TABS: Record<Exclude<Tab, "mas">, TabDef> = {
  hoy: { id: "hoy", label: "Hoy", icon: <CalendarCheck /> },
  registro: { id: "registro", label: "Registro", icon: <ClipboardList /> },
  terneros: { id: "terneros", label: "Terneros", icon: <Milk /> },
  tratamientos: { id: "tratamientos", label: "Tratamientos", short: "Tratam.", icon: <Stethoscope /> },
  indicadores: { id: "indicadores", label: "Indicadores", short: "Indicad.", icon: <ChartColumn /> },
  carga: { id: "carga", label: "Carga masiva", icon: <Upload /> },
  protocolos: { id: "protocolos", label: "Protocolos", icon: <FileText /> },
  equipo: { id: "equipo", label: "Equipo", icon: <Users /> },
  establecimientos: { id: "establecimientos", label: "Establecimientos", icon: <Building2 /> },
};
const MANAGER_TABS: Tab[] = ["hoy", "terneros", "tratamientos", "indicadores", "registro", "carga", "protocolos", "equipo", "establecimientos"];
// El operario solo ve lo del día; cambia de establecimiento desde el selector de arriba.
const OPERATOR_TABS: Tab[] = ["hoy", "registro"];
// En el celular la barra inferior muestra 4 accesos + "Más".
const MANAGER_MOBILE: Tab[] = ["hoy", "terneros", "tratamientos", "indicadores", "mas"];
const MORE_TABS: Tab[] = ["registro", "carga", "protocolos", "equipo", "establecimientos"];

function Shell({ session }: { session: Session }) {
  const userId = session.user.id;
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [farmId, setFarmId] = useState(() => { try { return localStorage.getItem(FARM_KEY) ?? ""; } catch { return ""; } });
  const [tab, setTab] = useState<Tab>("hoy");

  const loadFarms = useCallback(async () => {
    const [f, m] = await Promise.all([
      supabase.from("simple_guachera_farms").select("*").order("name"),
      supabase.from("simple_guachera_farm_members").select("farm_id, role").eq("user_id", userId),
    ]);
    const error = f.error ?? m.error;
    if (error) { toast.error(errorText(error, "No se pudieron cargar los establecimientos")); setFarms([]); return; }
    setRoles(Object.fromEntries((m.data as { farm_id: string; role: Role }[]).map((r) => [r.farm_id, r.role])));
    setFarms(f.data as Farm[]);
  }, [userId]);

  useEffect(() => {
    // Primero suma al usuario a los establecimientos donde lo invitaron.
    void supabase.rpc("simple_guachera_claim_invitations").then(({ data }) => {
      if (typeof data === "number" && data > 0) toast.ok(data === 1 ? "Te sumaron a un establecimiento" : `Te sumaron a ${data} establecimientos`);
      return loadFarms();
    });
  }, [loadFarms]);

  // Si el establecimiento guardado ya no existe, elegir el primero disponible.
  useEffect(() => {
    if (!farms) return;
    if (!farms.some((f) => f.id === farmId)) setFarmId(farms[0]?.id ?? "");
  }, [farms, farmId]);
  useEffect(() => { try { if (farmId) localStorage.setItem(FARM_KEY, farmId); } catch { /* sin almacenamiento */ } }, [farmId]);

  if (!farms) return <Loading text="Cargando establecimientos…" />;
  const farm = farms.find((f) => f.id === farmId) ?? null;
  const role = farm ? roles[farm.id] ?? null : null;
  const manager = isManager(role);
  const allowed = farm ? (manager ? MANAGER_TABS : OPERATOR_TABS) : ["establecimientos" as Tab];
  const active: Tab = tab === "mas" ? "mas" : allowed.includes(tab) ? tab : allowed[0];
  const mobileTabs = farm ? (manager ? MANAGER_MOBILE : OPERATOR_TABS) : [];
  const go = (next: Tab) => { setTab(next); window.scrollTo({ top: 0 }); };

  return <div className="min-h-dvh pb-24 sm:pb-8">
    <header className="sticky top-0 z-30 border-b border-[#dce5e1] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <div className="hidden sm:block"><Brand /></div>
        <img src="./simple-logo.png" alt="SInPLe" className="size-10 rounded-lg object-contain sm:hidden" />
        <div className="min-w-0 flex-1 sm:ml-4">
          {farms.length ? <select aria-label="Establecimiento" value={farmId} onChange={(e) => setFarmId(e.target.value)} className="h-10 w-full max-w-xs truncate rounded-xl border border-[#cedad5] bg-white px-3 text-sm font-bold text-brand-dark">
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select> : <p className="font-black text-brand-dark sm:hidden">SInPLe Guachera</p>}
          {role ? <p className="mt-0.5 pl-1 text-xs font-semibold text-slate-500">{ROLE_LABEL[role]}</p> : null}
        </div>
        <button onClick={() => void supabase.auth.signOut()} className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" title={`Salir (${session.user.email})`} aria-label="Cerrar sesión"><LogOut className="size-5" /></button>
      </div>
      {farm ? <nav className="mx-auto hidden max-w-5xl gap-1 overflow-x-auto px-4 pb-2 sm:flex">
        {allowed.map((id) => { const t = TABS[id as Exclude<Tab, "mas">]; return <TabButton key={id} active={active === id} onClick={() => go(id)} icon={t.icon} label={t.label} />; })}
      </nav> : null}
    </header>

    <main className="mx-auto max-w-5xl px-4 py-5">
      {active === "mas" ? <MoreMenu onPick={go} />
        : !farm || active === "establecimientos" ? <FarmsPanel farms={farms} roles={roles} userId={userId} email={session.user.email ?? ""} onChanged={loadFarms} onOpen={(id) => { setFarmId(id); go("hoy"); }} />
        : active === "hoy" ? <TodayPanel key={farm.id} farm={farm} userId={userId} manager={manager} />
        : active === "registro" ? <LogPanel key={farm.id} farm={farm} userId={userId} manager={manager} />
        : active === "terneros" ? <CalvesPanel key={farm.id} farm={farm} />
        : active === "tratamientos" ? <TreatmentsPanel key={farm.id} farm={farm} onGoProtocols={() => go("protocolos")} />
        : active === "indicadores" ? <IndicatorsPanel key={farm.id} farm={farm} />
        : active === "carga" ? <BulkImport key={farm.id} farm={farm} />
        : active === "protocolos" ? <ProtocolsPanel key={farm.id} farm={farm} />
        : <TeamPanel key={farm.id} farm={farm} userId={userId} />}
    </main>

    {mobileTabs.length ? <nav className={`fixed inset-x-0 bottom-0 z-30 grid border-t border-[#dce5e1] bg-white pb-[env(safe-area-inset-bottom)] sm:hidden ${mobileTabs.length === 5 ? "grid-cols-5" : "grid-cols-2"}`}>
      {mobileTabs.map((id) => id === "mas"
        ? <TabButton key={id} mobile active={active === "mas" || MORE_TABS.includes(active)} onClick={() => go("mas")} icon={<Menu />} label="Más" />
        : <TabButton key={id} mobile active={active === id} onClick={() => go(id)} icon={TABS[id as Exclude<Tab, "mas">].icon} label={TABS[id as Exclude<Tab, "mas">].short ?? TABS[id as Exclude<Tab, "mas">].label} />)}
    </nav> : null}
  </div>;
}

function MoreMenu({ onPick }: { onPick: (tab: Tab) => void }) {
  return <div className="space-y-2">
    <h1 className="mb-3 text-2xl font-black">Más opciones</h1>
    {MORE_TABS.map((id) => { const t = TABS[id as Exclude<Tab, "mas">]; return <button key={id} onClick={() => onPick(id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#dce5e1] bg-white p-4 text-left font-black [&_svg]:size-5 [&_svg]:text-brand">{t.icon}{t.label}</button>; })}
  </div>;
}

function TabButton({ active, onClick, icon, label, mobile }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; mobile?: boolean }) {
  if (mobile) return <button onClick={onClick} className={`flex min-w-0 flex-col items-center gap-1 py-2.5 text-[10px] font-bold tracking-tight [&_svg]:size-5 ${active ? "text-brand" : "text-slate-500"}`}>{icon}<span className="max-w-full truncate">{label}</span></button>;
  return <button onClick={onClick} className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold [&_svg]:size-4 ${active ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"}`}>{icon}{label}</button>;
}

function Loading({ text }: { text: string }) {
  return <div className="grid min-h-dvh place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-10 animate-spin text-brand" /><p className="mt-4 font-semibold text-slate-500">{text}</p></div></div>;
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { toast.error(errorText(error)); return; }
    toast.ok("Contraseña actualizada");
    onDone();
  }
  return <main className="grid min-h-dvh place-items-center p-4">
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,76,58,.12)] sm:p-9">
      <Brand />
      <h1 className="pt-2 text-2xl font-black">Elegí una nueva contraseña</h1>
      <Field label="Nueva contraseña"><Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      <Button type="submit" className="h-12 w-full" loading={saving}>{!saving ? <KeyRound /> : null}Guardar contraseña</Button>
    </form>
  </main>;
}
