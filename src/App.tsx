import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Building2, KeyRound, LoaderCircle, LogOut, Milk } from "lucide-react";
import { AuthScreen, Brand } from "./components/AuthScreen";
import { CalvesPanel } from "./components/CalvesPanel";
import { FarmsPanel } from "./components/FarmsPanel";
import { Button, Field, Input, Toaster, toast } from "./components/ui";
import { errorText, supabase } from "./lib/supabase";
import type { Farm } from "./lib/types";

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

type Tab = "terneros" | "establecimientos";

function Shell({ session }: { session: Session }) {
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [farmId, setFarmId] = useState(() => { try { return localStorage.getItem(FARM_KEY) ?? ""; } catch { return ""; } });
  const [tab, setTab] = useState<Tab>("terneros");

  const loadFarms = useCallback(async () => {
    const { data, error } = await supabase.from("simple_guachera_farms").select("*").order("name");
    if (error) { toast.error(errorText(error, "No se pudieron cargar los establecimientos")); setFarms([]); return; }
    setFarms(data as Farm[]);
  }, []);

  useEffect(() => { void loadFarms(); }, [loadFarms]);

  // Si el establecimiento guardado ya no existe, elegir el primero disponible.
  useEffect(() => {
    if (!farms) return;
    if (!farms.some((f) => f.id === farmId)) setFarmId(farms[0]?.id ?? "");
  }, [farms, farmId]);
  useEffect(() => { try { if (farmId) localStorage.setItem(FARM_KEY, farmId); } catch { /* sin almacenamiento */ } }, [farmId]);

  if (!farms) return <Loading text="Cargando establecimientos…" />;
  const farm = farms.find((f) => f.id === farmId) ?? null;
  const activeTab: Tab = farms.length ? tab : "establecimientos";

  return <div className="min-h-dvh pb-24 sm:pb-8">
    <header className="sticky top-0 z-30 border-b border-[#dce5e1] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <div className="hidden sm:block"><Brand /></div>
        <img src="./simple-logo.png" alt="SInPLe" className="size-10 rounded-lg object-contain sm:hidden" />
        <div className="min-w-0 flex-1 sm:ml-4">
          {farms.length ? <select aria-label="Establecimiento" value={farmId} onChange={(e) => setFarmId(e.target.value)} className="h-10 w-full max-w-xs truncate rounded-xl border border-[#cedad5] bg-white px-3 text-sm font-bold text-brand-dark">
            {farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select> : <p className="font-black text-brand-dark sm:hidden">SInPLe Guachera</p>}
        </div>
        <nav className="hidden gap-1 sm:flex">
          <TabButton active={activeTab === "terneros"} disabled={!farms.length} onClick={() => setTab("terneros")} icon={<Milk />} label="Terneros" />
          <TabButton active={activeTab === "establecimientos"} onClick={() => setTab("establecimientos")} icon={<Building2 />} label="Establecimientos" />
        </nav>
        <button onClick={() => void supabase.auth.signOut()} className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" title={`Salir (${session.user.email})`} aria-label="Cerrar sesión"><LogOut className="size-5" /></button>
      </div>
    </header>

    <main className="mx-auto max-w-5xl px-4 py-5">
      {activeTab === "terneros" && farm
        ? <CalvesPanel key={farm.id} farm={farm} />
        : <FarmsPanel farms={farms} userId={session.user.id} onChanged={loadFarms} onOpen={(id) => { setFarmId(id); setTab("terneros"); }} />}
    </main>

    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-[#dce5e1] bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
      <TabButton mobile active={activeTab === "terneros"} disabled={!farms.length} onClick={() => setTab("terneros")} icon={<Milk />} label="Terneros" />
      <TabButton mobile active={activeTab === "establecimientos"} onClick={() => setTab("establecimientos")} icon={<Building2 />} label="Establecimientos" />
    </nav>
  </div>;
}

function TabButton({ active, disabled, onClick, icon, label, mobile }: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string; mobile?: boolean }) {
  if (mobile) return <button onClick={onClick} disabled={disabled} className={`flex flex-col items-center gap-1 py-2.5 text-xs font-bold disabled:opacity-40 [&_svg]:size-5 ${active ? "text-brand" : "text-slate-500"}`}>{icon}{label}</button>;
  return <button onClick={onClick} disabled={disabled} className={`flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold disabled:opacity-40 [&_svg]:size-4 ${active ? "bg-brand-soft text-brand-dark" : "text-slate-600 hover:bg-slate-100"}`}>{icon}{label}</button>;
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
