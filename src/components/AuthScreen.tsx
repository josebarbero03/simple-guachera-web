import { useState, type FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { errorText, supabase } from "../lib/supabase";
import { Button, Field, Input, toast } from "./ui";

type Mode = "login" | "register" | "reset";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const redirectTo = window.location.origin + window.location.pathname;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "register") {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo } });
        if (error) throw error;
        setSent(`Enviamos un mensaje a ${email.trim()}. Abrí el enlace de confirmación y después volvé para ingresar.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setSent(`Enviamos un enlace a ${email.trim()} para elegir una nueva contraseña.`);
      }
    } catch (error) {
      toast.error(errorText(error, "No se pudo completar el ingreso"));
    } finally {
      setSending(false);
    }
  }

  const titles: Record<Mode, string> = { login: "Ingresar a la guachera", register: "Crear cuenta", reset: "Recuperar contraseña" };

  return <main className="grid min-h-dvh lg:grid-cols-[1.05fr_.95fr]">
    <section className="hidden bg-brand-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Brand light />
      <div className="max-w-xl">
        <p className="text-sm font-bold uppercase tracking-[.16em] text-brand-accent">Gestión desde el nacimiento</p>
        <h1 className="mt-4 text-5xl font-black leading-[1.08]">Cada ternero de cada establecimiento, en un solo lugar.</h1>
        <div className="mt-8 grid gap-4 text-emerald-50">
          {["Información separada por establecimiento", "Funciona en el celular como una app", "Datos guardados en la nube"].map((text) => <div key={text} className="flex items-center gap-3"><CheckCircle2 className="size-5 text-brand-accent" /><span className="text-lg">{text}</span></div>)}
        </div>
      </div>
      <p className="text-sm text-emerald-100/65">José Barbero · Asesor en Manejo de Tambos</p>
    </section>

    <section className="flex items-center justify-center p-4 sm:p-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,76,58,.12)] sm:p-9">
        <div className="mb-7 lg:hidden"><Brand /></div>
        {sent ? <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Mail className="size-7" /></span>
          <h2 className="mt-5 text-2xl font-black">Revisá tu correo</h2>
          <p className="mt-3 leading-6 text-slate-600">{sent}</p>
          <Button className="mt-6 w-full" onClick={() => { setSent(null); setMode("login"); }}>Ir al ingreso</Button>
        </div> : <>
          <p className="text-sm font-bold uppercase tracking-[.14em] text-brand">Ingreso seguro</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">{titles[mode]}</h2>
          {mode !== "reset" ? <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(["login", "register"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === m ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"}`}>{m === "login" ? "Ingresar" : "Crear cuenta"}</button>)}
          </div> : null}
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" ? <Field label="Nombre y apellido"><Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></Field> : null}
            <Field label="Correo electrónico"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@campo.com" required /></Field>
            {mode !== "reset" ? <Field label="Contraseña">
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" minLength={mode === "register" ? 8 : undefined} className="pr-12" required />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 mt-1.5 grid w-12 place-items-center text-slate-500" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button>
              </div>
            </Field> : null}
            <Button type="submit" className="h-12 w-full" loading={sending}>
              {!sending ? (mode === "login" ? <LockKeyhole /> : mode === "register" ? <UserPlus /> : <KeyRound />) : null}
              {mode === "login" ? "Ingresar" : mode === "register" ? "Crear cuenta" : "Enviar enlace"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {mode === "reset"
              ? <button className="font-semibold text-brand" onClick={() => setMode("login")}>Volver al ingreso</button>
              : <button className="font-semibold text-brand" onClick={() => setMode("reset")}>Olvidé mi contraseña</button>}
          </div>
          <div className="mt-6 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" /><p>Cada usuario accede únicamente a sus establecimientos y registros.</p></div>
        </>}
      </div>
    </section>
  </main>;
}

export function Brand({ light = false }: { light?: boolean }) {
  return <div className="flex items-center gap-3">
    <img src="./logo.svg" alt="" width={48} height={48} className="size-12" />
    <div><p className={`text-lg font-black ${light ? "" : "text-brand-dark"}`}>SInPLe Guachera</p><p className={`text-xs ${light ? "text-emerald-100/75" : "text-slate-500"}`}>Seguimiento Integral de la Producción Lechera</p></div>
  </div>;
}
