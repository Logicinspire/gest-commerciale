import { useEffect, useState } from "react";
import { CheckCircle2, Circle, User, MessageSquareText, History, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { TIPI, PRESETS, presetDate, fmtDate, fmtDateTime, todayStr } from "@/lib/constants";
import { QuickReschedule } from "@/components/QuickReschedule";

const RimandiHistory = ({ a }) => {
  const [items, setItems] = useState(null);
  const [show, setShow] = useState(false);
  const toggle = async () => {
    if (!show && !items) {
      try { setItems((await api.get(`/activities/${a.id}/storico`)).data); } catch (e) { toast.error(errMsg(e)); return; }
    }
    setShow(!show);
  };
  return (
    <div className="border-t border-slate-100" data-testid={`rimandi-history-${a.id}`}>
      <button onClick={toggle} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50" data-testid={`rimandi-toggle-${a.id}`}>
        <History className="h-3.5 w-3.5 text-[#C9A227]" />Storico rimandi di “{a.oggetto_base || a.oggetto}”
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${show ? "rotate-180" : ""}`} />
      </button>
      {show && items && (
        <ol className="space-y-2 px-3 pb-3" data-testid={`rimandi-list-${a.id}`}>
          {items.map((x, i) => (
            <li key={x.id} className={`relative border-l-2 pl-3 ${x.id === a.id ? "border-[#0a3b7c]" : "border-[#C9A227]/60"}`} data-testid={`rimandi-item-${x.id}`}>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {x.done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5 text-slate-300" />}
                <span className="font-semibold">{i === 0 && !x.rimando_n ? "Attività originale" : x.rimando_n === 1 ? "Rimando" : `Rimando ${x.rimando_n}`}</span>
                <span className="text-slate-500" data-testid={`rimandi-item-date-${x.id}`}>· programmata {fmtDate(x.data, "EEE d MMM yyyy")}{x.ora ? ` alle ${x.ora}` : ""}{x.id === a.id ? " · questa" : ""}</span>
              </div>
              <div className={`mt-0.5 whitespace-pre-wrap rounded px-2 py-1 text-xs ${x.note ? "bg-yellow-50 text-slate-800" : "text-slate-400"}`}>{x.note || "Nessun feedback"}</div>
              {(x.done_at || x.note_at) && (
                <div className="mt-0.5 text-[11px] text-slate-500" data-testid={`rimandi-item-feedback-at-${x.id}`}>
                  {x.done_at ? `Completata il ${fmtDateTime(x.done_at)}` : `Feedback del ${fmtDateTime(x.note_at)}`}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export const ActivityCard = ({ a, onChanged }) => {
  const { userName } = useApp();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(a.note || "");
  const [recallTime, setRecallTime] = useState(a.ora || "");
  useEffect(() => { setNote(a.note || ""); }, [a.note]);
  const Icon = TIPI[a.tipo]?.Icon || Circle;
  const late = !a.done && a.data < todayStr();

  const save = async (extra = {}, msg = "Feedback salvato") => {
    try {
      await api.patch(`/activities/${a.id}`, { note: note.trim() || null, ...extra });
      toast.success(msg); setOpen(false); onChanged();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const completeAndRecall = async (key) => {
    try {
      await api.patch(`/activities/${a.id}`, { note: note.trim() || null, done: true });
      const base = a.oggetto_base || a.oggetto;
      const n = (a.rimando_n || 0) + 1;
      const oggetto = `${n === 1 ? "Rimando" : `Rimando ${n}`} - ${base}`;
      await api.post("/activities", { tipo: "richiamo", oggetto, oggetto_base: base, rimando_n: n, rimando_di: a.id, catena_id: a.catena_id || a.id, data: presetDate(key), ora: recallTime || null, person_id: a.person_id, deal_id: a.deal_id, owner_id: a.owner_id });
      toast.success(`Completata · ${oggetto} il ${fmtDate(presetDate(key), "d MMM")}`); setOpen(false); onChanged();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const toggle = () => (a.done ? save({ done: false }, "Attività riaperta") : setOpen(true));

  return (
    <div className="flex gap-3" data-testid={`activity-card-${a.id}`}>
      <div className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white"><Icon className="h-4 w-4 text-slate-600" /></div>
      <div className={`min-w-0 flex-1 overflow-hidden rounded-md border bg-white ${open ? "border-[#0a3b7c]/40 shadow-md" : "border-slate-200"}`}>
        <div className="flex items-start gap-2 p-3">
          <button onClick={toggle} title={a.done ? "Riapri" : "Completa con feedback"} data-testid={`activity-toggle-${a.id}`}>
            {a.done ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-green-600" />}
          </button>
          <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} data-testid={`activity-open-${a.id}`}>
            <div className={`text-[15px] font-semibold ${a.done ? "text-slate-700" : ""}`}>{a.oggetto}</div>
            <div className={`flex flex-wrap items-center gap-x-1.5 text-xs ${late ? "text-red-600" : "text-slate-500"}`}>
              <span>{fmtDate(a.data, "EEE d MMMM yyyy")}{a.ora ? ` alle ${a.ora}` : ""}</span>
              <span>· {userName(a.owner_id) || "—"}</span>
              {a.person && <span className="flex items-center gap-0.5">· <User className="h-3 w-3" />{a.person.full_name}</span>}
            </div>
          </button>
          {!a.done && <QuickReschedule activity={a} onDone={onChanged} />}
        </div>
        {!open && a.note && (
          <button onClick={() => setOpen(true)} className="block w-full whitespace-pre-wrap border-t border-yellow-200 bg-yellow-50 px-3 py-2 text-left text-sm text-slate-800" data-testid={`activity-note-${a.id}`}>{a.note}</button>
        )}
        {!open && !a.note && (
          <button onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-xs text-[#0a3b7c] hover:bg-slate-50" data-testid={`activity-add-feedback-${a.id}`}>
            <MessageSquareText className="h-3.5 w-3.5" />Lascia un feedback
          </button>
        )}
        {a.rimando_n > 0 && <RimandiHistory a={a} />}
        {open && (
          <div className="space-y-2 border-t border-yellow-200 bg-yellow-50/60 p-3" data-testid={`activity-feedback-panel-${a.id}`}>
            <textarea autoFocus className="min-h-[80px] w-full rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm outline-none focus:border-yellow-500"
              placeholder="Com'è andata? Es. non risponde, richiamare martedì, interessato al corso…" value={note} onChange={(e) => setNote(e.target.value)} data-testid={`activity-feedback-input-${a.id}`} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className="btn-ghost h-8 text-xs" onClick={() => { setOpen(false); setNote(a.note || ""); }} data-testid={`activity-feedback-cancel-${a.id}`}>Annulla</button>
              <button className="btn-ghost h-8 text-xs" onClick={() => save()} data-testid={`activity-feedback-save-${a.id}`}>Salva feedback</button>
              {!a.done && <button className="inline-flex h-8 items-center gap-1 rounded-md bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700" onClick={() => save({ done: true }, "Attività completata")} data-testid={`activity-feedback-complete-${a.id}`}><CheckCircle2 className="h-3.5 w-3.5" />Salva e completa</button>}
            </div>
            {!a.done && (
              <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs" data-testid={`activity-complete-recall-${a.id}`}>
                <span className="text-slate-500">Completa e richiama tra:</span>
                <input type="time" className="crm-input h-7 w-24 text-xs" value={recallTime} onChange={(e) => setRecallTime(e.target.value)} title="Orario del rimando" data-testid={`activity-recall-time-${a.id}`} />
                {PRESETS.map((p) => (
                  <button key={p.key} onClick={() => completeAndRecall(p.key)} className="rounded-full border border-[#C9A227] bg-white px-2.5 py-0.5 hover:bg-[#C9A227]/15" data-testid={`activity-complete-recall-${p.key}-${a.id}`}>{p.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
