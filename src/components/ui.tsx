import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { CheckCircle2, LoaderCircle, X, XCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-brand-soft text-brand-dark hover:bg-[#dbeae3]",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-rose-50 text-rose-700 hover:bg-rose-100",
};

export function Button({ variant = "primary", loading, className = "", children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return <button {...props} disabled={disabled || loading} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-60 [&_svg]:size-4 ${variants[variant]} ${className}`}>
    {loading ? <LoaderCircle className="animate-spin" /> : null}{children}
  </button>;
}

const control = "mt-1.5 h-11 w-full rounded-xl border border-[#cedad5] bg-white px-3 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{children}{hint ? <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span> : null}</label>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`${control} ${props.className ?? ""}`} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`${control} ${props.className ?? ""}`} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`${control} h-auto min-h-20 py-2 ${props.className ?? ""}`} />; }

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-2xl border border-[#dce5e1] bg-white p-4 shadow-[0_6px_24px_rgba(15,76,58,.06)] sm:p-5 ${className}`}>{children}</section>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button></div>
      {children}
    </div>
  </div>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#cedad5] bg-white/60 px-5 py-10 text-center">
    <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand [&_svg]:size-6">{icon}</div>
    <p className="mt-4 font-black">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{text}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>;
}

type ToastItem = { id: number; kind: "ok" | "error"; text: string };
let push: ((toast: Omit<ToastItem, "id">) => void) | null = null;
export const toast = {
  ok: (text: string) => push?.({ kind: "ok", text }),
  error: (text: string) => push?.({ kind: "error", text }),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    push = (item) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { ...item, id }]);
      setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 4000);
    };
    return () => { push = null; };
  }, []);
  return <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
    {items.map((t) => <div key={t.id} role="status" className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${t.kind === "ok" ? "bg-brand-deep text-white" : "bg-rose-600 text-white"}`}>
      {t.kind === "ok" ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}{t.text}
    </div>)}
  </div>;
}
