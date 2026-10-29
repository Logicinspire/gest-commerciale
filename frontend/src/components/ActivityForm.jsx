import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, User, CircleDollarSign, StickyNote, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { TIPI, PRESETS, presetDate, todayStr } from "@/lib/constants";
import { PersonPicker } from "@/components/PersonPicker";

const HOUR_H = 44;
const START = 8;

const DayCalendar = ({ day, setDay, draft, ownerId }) => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/activities", { params: { day, owner: ownerId, period: "tutte" } }).then((r) => setItems(r.data.items)).catch(() => setItems([]));
  }, [day, ownerId]);
  const pos = (ora) => { const [h, m] = (ora || "09:00").split(":").map(Number); return Math.max(0, (h - START) * HOUR_H + (m / 60) * HOUR_H); };
  const noTime = items.filter((a) => !a.ora);
  return (
    <div className="flex w-[260px] shrink-0 flex-col border-l border-slate-200" data-testid="mini-day-calendar">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-medium capitalize" data-testid="mini-calendar-day">{format(parseISO(day), "EEEE d MMMM", { locale: it })}</span>
        <div className="flex">
          <button type="button" onClick={() => setDay(format(addDays(parseISO(day), -1), "yyyy-MM-dd"))} className="rounded p-1 hover:bg-slate-100" data-testid="mini-calendar-prev"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setDay(format(addDays(parseISO(day), 1), "yyyy-MM-dd"))} className="rounded p-1 hover:bg-slate-100" data-testid="mini-calendar-next"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="min-h-[34px] space-y-1 border-b border-slate-200 p-1.5">
        {noTime.map((a) => <div key={a.id} className={`truncate rounded px-2 py-0.5 text-xs ${a.done ? "bg-slate-100 text-slate-400 line-through" : "bg-[#0a3b7c]/10 text-[#0a3b7c]"}`}>{a.oggetto}</div>)}
        {draft && !draft.ora && <div className="truncate rounded bg-[#0a3b7c] px-2 py-0.5 text-xs font-semibold text-white">{draft.oggetto || TIPI[draft.tipo].label}</div>}
      </div>
      <div className="relative h-[360px] overflow-y-auto">
        <div className="relative" style={{ height: HOUR_H * 13 }}>
          {Array.from({ length: 13 }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 border-t border-slate-100 pl-2 text-[10px] text-slate-400" style={{ top: i * HOUR_H }}>{String(START + i).padStart(2, "0")}:00</div>
          ))}
          {items.filter((a) => a.ora).map((a) => (
            <div key={a.id} className={`absolute left-12 right-2 truncate rounded px-2 py-0.5 text-[11px] ${a.done ? "bg-slate-100 text-slate-400 line-through" : "bg-[#0a3b7c]/10 text-[#0a3b7c]"}`} style={{ top: pos(a.ora), height: HOUR_H / 2 }}>
              {a.ora} {a.oggetto} {a.person ? `· ${a.person.full_name}` : ""}
            </div>
          ))}
          {draft?.ora && draft.data === day && (
            <div className="absolute left-12 right-2 truncate rounded bg-[#0a3b7c] px-2 py-0.5 text-[11px] font-semibold text-white shadow" style={{ top: pos(draft.ora), height: HOUR_H / 2 }}>
              {draft.ora} {draft.oggetto || TIPI[draft.tipo].label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ActivityForm = ({ person, deals = [], onSaved, onCancel, withCalendar = true, defaultDealId = "" }) => {
  const { team, me } = useApp();
  const blank = () => ({ tipo: "chiamata", oggetto: "", data: todayStr(), ora: "", ora_fine: "", note: "", owner_id: me.user_id, deal_id: defaultDealId, done: false, priorita: "" });
  const [f, setF] = useState(blank);
  const [pickedPerson, setPickedPerson] = useState(person || null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const body = { ...f, oggetto: f.oggetto || TIPI[f.tipo].label, ora: f.ora || null, ora_fine: f.ora_fine || null, deal_id: f.deal_id || null,
        priorita: f.priorita || null, person_id: pickedPerson?.id || null };
      await api.post("/activities", body);
      toast.success("Attività salvata");
      setF(blank());
      onSaved?.();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="flex" data-testid="activity-form">
      <div className="flex-1 space-y-3 p-4">
        <input className="h-11 w-full rounded-md border-2 border-[#0a3b7c]/60 px-3 font-display text-xl outline-none focus:border-[#0a3b7c]"
          placeholder={TIPI[f.tipo].label} value={f.oggetto} onChange={(e) => set("oggetto", e.target.value)} data-testid="activity-field-oggetto" />
        <div className="flex gap-1">
          {Object.entries(TIPI).map(([k, { label, Icon }]) => (
            <button type="button" key={k} onClick={() => set("tipo", k)} data-testid={`activity-type-${k}`}
              className={`flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors ${f.tipo === k ? "border-[#0a3b7c] bg-[#0a3b7c]/10 text-[#0a3b7c]" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          <input type="date" className="crm-input w-40" value={f.data} onChange={(e) => set("data", e.target.value)} data-testid="activity-field-data" />
          <input type="time" className="crm-input w-28" value={f.ora} onChange={(e) => set("ora", e.target.value)} data-testid="activity-field-ora" />
          <span className="text-slate-400">–</span>
          <input type="time" className="crm-input w-28" value={f.ora_fine} onChange={(e) => set("ora_fine", e.target.value)} data-testid="activity-field-ora-fine" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6" data-testid="activity-quick-presets">
          <span className="text-xs text-slate-500">Richiamo veloce:</span>
          {PRESETS.map((p) => (
            <button type="button" key={p.key} onClick={() => setF((x) => ({ ...x, data: presetDate(p.key), tipo: x.tipo === "chiamata" ? "richiamo" : x.tipo }))}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${f.data === presetDate(p.key) ? "border-[#C9A227] bg-[#C9A227]/15 text-[#7a6214]" : "border-slate-300 text-slate-600 hover:border-[#C9A227]"}`}
              data-testid={`activity-preset-${p.key}`}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-start gap-2">
          <StickyNote className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
          <textarea className="min-h-[80px] w-full rounded-md border border-yellow-200 bg-yellow-50 p-2 text-sm outline-none focus:border-yellow-400" placeholder="Note"
            value={f.note} onChange={(e) => set("note", e.target.value)} data-testid="activity-field-note" />
        </div>
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 shrink-0 text-slate-400" />
          <select className="crm-select" value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)} data-testid="activity-field-owner">
            {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}{u.user_id === me.user_id ? " (Tu)" : ""}</option>)}
          </select>
          <select className="crm-select" value={f.priorita} onChange={(e) => set("priorita", e.target.value)} data-testid="activity-field-priorita">
            <option value="">Priorità</option><option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option>
          </select>
        </div>
        {deals.length > 0 && (
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 shrink-0 text-slate-400" />
            <select className="crm-select w-full" value={f.deal_id} onChange={(e) => set("deal_id", e.target.value)} data-testid="activity-field-deal">
              <option value="">Affare (facoltativo)</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.titolo}</option>)}
            </select>
          </div>
        )}
        {!person && (
          <div className="flex items-center gap-2"><User className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="flex-1"><PersonPicker value={pickedPerson} onChange={setPickedPerson} testid="activity-person-picker" /></div>
          </div>
        )}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.done} onChange={(e) => set("done", e.target.checked)} className="accent-[#0a3b7c]" data-testid="activity-field-done" />Segna come completata
          </label>
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel} data-testid="activity-cancel-btn">Annulla</button>}
          <button type="button" className="btn-primary" onClick={save} data-testid="activity-save-btn">Salva</button>
        </div>
      </div>
      {withCalendar && <DayCalendarWrapper f={f} set={set} />}
    </div>
  );
};

const DayCalendarWrapper = ({ f, set }) => <DayCalendar day={f.data} setDay={(d) => set("data", d)} draft={f} ownerId={f.owner_id} />;
