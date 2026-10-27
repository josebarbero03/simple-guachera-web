// Textos en lenguaje simple para el operario: sin siglas ni términos técnicos.

const ROUTES: [RegExp, string][] = [
  [/\b(im|i\.m\.?)\b|intramusc|m[uú]sculo/i, "Inyección en el músculo"],
  [/\b(sc|s\.c\.?)\b|subcut|bajo la piel/i, "Inyección bajo la piel"],
  [/\b(ev|iv|e\.v\.?|i\.v\.?)\b|endoven|intraven|vena/i, "Inyección en la vena"],
  [/oral|boca|mamadera|bebida/i, "Por la boca"],
  [/t[oó]pic|piel|spray|pomada/i, "Sobre la piel"],
  [/intranasal|nariz|nasal/i, "En la nariz"],
  [/ombligo/i, "En el ombligo"],
];

/** "IM" → "Inyección en el músculo". Si no la reconoce, devuelve lo que escribió el veterinario. */
export function plainRoute(route: string) {
  const r = route.trim();
  if (!r || /seg[uú]n indicaci/i.test(r)) return "";
  return ROUTES.find(([re]) => re.test(r))?.[1] ?? r;
}

/** Instrucción corta: "Producto X · 5 ml · Inyección en el músculo". */
export function plainInstruction(product: string, dose: string, route: string) {
  return [product, dose && !/seg[uú]n/i.test(dose) ? dose : "", plainRoute(route)].filter(Boolean).join(" · ");
}

export type Turno = "mañana" | "tarde" | "noche";
export function turnoFor(date = new Date()): Turno {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hourCycle: "h23" }).format(date));
  return h >= 5 && h < 13 ? "mañana" : h >= 13 && h < 20 ? "tarde" : "noche";
}

export function greeting(date = new Date()) {
  const t = turnoFor(date);
  return t === "mañana" ? "Buen día" : t === "tarde" ? "Buenas tardes" : "Buenas noches";
}

/** Síntomas para tocar en "Avisar un problema". urgent = se marca urgente sin preguntar. */
export const SYMPTOMS = [
  { id: "diarrea", label: "Diarrea", urgent: false },
  { id: "respira", label: "Respira mal o tose", urgent: true },
  { id: "notoma", label: "No toma la leche", urgent: false },
  { id: "caido", label: "No se levanta", urgent: true },
  { id: "decaido", label: "Decaído, triste", urgent: false },
  { id: "ombligo", label: "Ombligo hinchado", urgent: false },
  { id: "lastimado", label: "Lastimado o rengo", urgent: false },
  { id: "otro", label: "Otra cosa", urgent: false },
] as const;
export type SymptomId = (typeof SYMPTOMS)[number]["id"];

export function symptomsText(ids: SymptomId[]) {
  return SYMPTOMS.filter((s) => ids.includes(s.id) && s.id !== "otro").map((s) => s.label).join(", ");
}
export const isUrgent = (ids: SymptomId[]) => SYMPTOMS.some((s) => s.urgent && ids.includes(s.id));

/** Lee en voz alta (útil para quien lee con dificultad). Devuelve false si el celular no puede. */
export function speak(text: string) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-AR";
  u.rate = 0.95;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}
