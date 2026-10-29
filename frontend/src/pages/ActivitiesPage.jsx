import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CheckCircle2, Circle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { TIPI, fmtDate, todayStr } from "@/lib/constants";
import { QuickReschedule } from "@/components/QuickReschedule";
import { ActivityForm } from "@/components/ActivityForm";

const PERIODS = [["da_fare", "Cose da fare"], ["ritardo", "In ritardo"], ["oggi", "Oggi"], ["domani", "Domani"], ["settimana", "Questa settimana"], ["prossima", "Prossima settimana"], ["tutte", "Tutte"]];

export default function ActivitiesPage() {
  const { team, me, isAdmin } = useApp();
  const nav = useNavigate();
  const [period, setPeriod] = useState("oggi");
  const [tipo, setTipo] = useState("");
  const [owner, setOwner] = useState("me");
  const [data, setData] = useState({ items: [], total: 0 });
  const [counts, setCounts] = useState({});
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    const params = period === "da_fare" ? { period: "tutte", status: "da_fare" } : { period, status: "tutte" };
    api.get("/activities", { params: { ...params, owner, tipo, limit: 300 } }).then((r) => setData(r.data));
    api.get("/activities/counts", { params: { owner } }).then((r) => setCounts(r.data));
  }, [period, owner, tipo]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (a) => { try { await api.patch(`/activities/${a.id}`, { done: !a.done }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async (a) => { try { await api.delete(`/activities/${a.id}`); toast.success("Attività eliminata"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const today = todayStr();
  return (
    <div className="p-5 fade-in" data-testid="activities-page">
      <div className="mb-3 flex items-center gap-2">
        <button className="btn-primary" onClick={() => setOpen(true)} data-testid="add-activity-btn"><Plus className="h-4 w-4" />Attività</button>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={load} className="flex items-center gap-1.5 text-sm font-semibold" data-testid="activities-total"><RefreshCw className="h-4 w-4" />{data.total} attività</button>
          <select className="crm-select" value={owner} onChange={(e) => setOwner(e.target.value)} data-testid="activities-owner-filter">
            <option value="me">Le mie ({me.name})</option><option value="all">Tutti</option>
            {team.filter((u) => u.user_id !== me.user_id).map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setTipo("")} className={`rounded px-2.5 py-1 text-sm ${!tipo ? "bg-[#0a3b7c]/10 font-semibold text-[#0a3b7c]" : "text-slate-600"}`} data-testid="type-filter-all">Tutto</button>
          {Object.entries(TIPI).map(([k, { label, Icon }]) => (
            <button key={k} onClick={() => setTipo(k)} title={label} className={`flex items-center gap-1 rounded px-2.5 py-1 text-sm ${tipo === k ? "bg-[#0a3b7c]/10 font-semibold text-[#0a3b7c]" : "text-slate-600 hover:bg-slate-50"}`} data-testid={`type-filter-${k}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`rounded px-2.5 py-1 text-sm ${period === k ? "bg-[#0a3b7c]/10 font-semibold text-[#0a3b7c]" : "text-slate-700 hover:bg-slate-50"}`} data-testid={`filter-${k.replace("_", "-")}`}>
              {l}{counts[k] > 0 && <span className={`ml-1 rounded-full px-1.5 text-[11px] font-bold ${k === "ritardo" ? "bg-red-600 text-white" : "bg-slate-200"}`}>{counts[k]}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse" data-testid="activities-table">
          <thead><tr><th className="th w-24">Completata</th><th className="th">Data di scadenza</th><th className="th">Oggetto</th><th className="th">Persona di contatto</th><th className="th">Email</th><th className="th">Telefono</th><th className="th">Affare</th><th className="th">Assegnata a</th><th className="th">Azioni</th></tr></thead>
          <tbody>
            {data.items.map((a) => {
              const late = !a.done && a.data < today;
              const color = a.done ? "text-slate-400 line-through" : late ? "text-red-600" : "text-green-700";
              const Icon = TIPI[a.tipo]?.Icon || Circle;
              return (
                <tr key={a.id} className="hover:bg-slate-50" data-testid={`activity-row-${a.id}`}>
                  <td className="td text-center"><button onClick={() => toggle(a)} data-testid={`activity-done-${a.id}`}>{a.done ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-green-600" />}</button></td>
                  <td className={`td ${color}`}>{fmtDate(a.data, "d MMM yyyy")}{a.ora ? ` ${a.ora}` : ""}</td>
                  <td className={`td ${color}`}><span className="flex items-center gap-1.5"><Icon className="h-4 w-4" />{a.oggetto}</span></td>
                  <td className="td">{a.person ? <button onClick={() => nav(`/persone/${a.person.id}`)} className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:border-[#0a3b7c]" data-testid={`activity-person-${a.id}`}>{a.person.full_name}</button> : "—"}</td>
                  <td className="td text-xs text-[#0a3b7c]">{a.person?.email}</td>
                  <td className="td text-xs text-[#0a3b7c]">{a.person?.telefono}</td>
                  <td className="td max-w-[160px] truncate text-xs">{a.deal?.titolo}</td>
                  <td className="td text-xs">{team.find((u) => u.user_id === a.owner_id)?.name || "—"}</td>
                  <td className="td"><div className="flex items-center gap-1">
                    {!a.done && <QuickReschedule activity={a} onDone={load} />}
                    {(isAdmin || a.owner_id === me.user_id) && <button onClick={() => del(a)} className="p-1" data-testid={`activity-delete-${a.id}`}><Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" /></button>}
                  </div></td>
                </tr>
              );
            })}
            {!data.items.length && <tr><td colSpan={9} className="p-10 text-center text-sm text-slate-500" data-testid="activities-empty">Nessuna attività in questo periodo</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-0" data-testid="activity-dialog">
          <DialogHeader className="px-4 pt-4"><DialogTitle className="font-display">Nuova attività</DialogTitle></DialogHeader>
          <ActivityForm onSaved={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
