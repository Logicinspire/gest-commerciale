import { addDays, addMonths, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, BellRing, RefreshCw, Repeat } from "lucide-react";

export const LABEL_COLORS = {
  "Ha richiesto info": "bg-sky-100 text-sky-800 border-sky-200",
  "Interessato": "bg-amber-100 text-amber-800 border-amber-200",
  "Già cliente": "bg-green-100 text-green-800 border-green-200",
  "Richiama lui": "bg-purple-100 text-purple-800 border-purple-200",
  "Fuori target": "bg-red-600 text-white border-red-700",
  "Negativo": "bg-rose-100 text-rose-800 border-rose-200",
  "Non risponde mai": "bg-orange-100 text-orange-800 border-orange-200",
  "Valuta": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Aspetto contratto": "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export const FASI = ["Contatto ricevuto", "Contatto chiamato", "Proposta inviata", "Remind inviati", "Aggiudicato", "Perso"];
export const AUTO_FASI = ["Proposta inviata", "Remind inviati", "Aggiudicato", "Perso"];
export const FASE_COLORS = {
  "Contatto ricevuto": "#3b82f6", "Contatto chiamato": "#6366f1", "Proposta inviata": "#C9A227",
  "Remind inviati": "#8b5cf6", "Aggiudicato": "#10b981", "Perso": "#ef4444",
};

export const TIPI = {
  chiamata: { label: "Chiamata", Icon: Phone },
  richiamo: { label: "Richiamo", Icon: BellRing },
  follow_up: { label: "Follow up", Icon: Repeat },
  rinnovo: { label: "Rinnovo", Icon: RefreshCw },
};

export const PRESETS = [
  { key: "1d", label: "Domani", fn: (d) => addDays(d, 1) },
  { key: "3d", label: "3 giorni", fn: (d) => addDays(d, 3) },
  { key: "1w", label: "1 settimana", fn: (d) => addDays(d, 7) },
  { key: "1m", label: "1 mese", fn: (d) => addMonths(d, 1) },
  { key: "4m", label: "4 mesi", fn: (d) => addMonths(d, 4) },
];

export const todayStr = () => format(new Date(), "yyyy-MM-dd");
export const presetDate = (key) => format(PRESETS.find((p) => p.key === key).fn(new Date()), "yyyy-MM-dd");

export const fmtDate = (s, pattern = "d MMMM yyyy") => {
  if (!s) return "";
  try { return format(parseISO(s), pattern, { locale: it }); } catch { return s; }
};
export const fmtDateTime = (s) => fmtDate(s, "d MMM yyyy HH:mm");
export const fmtMoney = (v) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

export const initials = (name) => (name || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export const buildPropostaUrl = (base, person, deal) => {
  const q = new URLSearchParams();
  const add = (k, v) => v && q.set(k, v);
  add("nome", person?.nome); add("cognome", person?.cognome); add("email", person?.email); add("telefono", person?.telefono);
  add("citta", person?.citta); add("professione", person?.professione);
  add("prodotto", deal?.titolo || person?.prodotto_richiesto);
  add("prodotti", (deal?.prodotti || []).join(","));
  add("valore", deal?.valore); add("crm_person_id", person?.id); add("crm_deal_id", deal?.id);
  return `${base || "https://contratti.italiacorsi.it"}/proposte/nuova?${q.toString()}`;
};
