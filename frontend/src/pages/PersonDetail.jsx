import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronUp, Mail, Phone, Building2, Pencil, Plus, Hand, Trash2, StickyNote, CalendarCheck, FileSignature, CheckCircle2, Circle, X } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { FASI, FASE_COLORS, TIPI, fmtDate, fmtDateTime, fmtMoney, initials } from "@/lib/constants";
import { LabelPicker } from "@/components/LabelPill";
import { PersonDialog } from "@/components/PersonDialog";
import { DealDialog } from "@/components/DealDialog";
import { ActivityForm } from "@/components/ActivityForm";
import { QuickReschedule } from "@/components/QuickReschedule";
import { ProposalDialog } from "@/components/ProposalDialog";
import { ProposalPanel, StatoPill } from "@/components/ProposalPanel";

export const Section = ({ title, children, action, testid }) => {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-slate-200 px-5 py-4" data-testid={testid}>
      <div className="mb-3 flex items-center justify-between">
        <button className="section-title" onClick={() => setOpen(!open)}><ChevronUp className={`h-4 w-4 transition-transform ${open ? "" : "rotate-180"}`} />{title}</button>
        {action}
      </div>
      {open && children}
    </section>
  );
};

const DETAILS = [["nome", "Nome"], ["cognome", "Cognome"], ["professione", "Professione"], ["primo_contatto", "Primo contatto"], ["prodotto_richiesto", "Prodotto richiesto"],
  ["tipo_marketing", "Tipo marketing"], ["citta", "Città"], ["privacy", "Privacy"]];

const DealsBlock = ({ deals, proposte, onNew, onChanged, onProposal, onOpenProp, onOpenDeal }) => {
  const setFase = async (d, fase) => {
    try { await api.patch(`/deals/${d.id}`, { fase }); toast.success(`Fase: ${fase}`); onChanged(); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!deals.length) return <div className="text-sm text-slate-500">Nessun affare. <button className="font-medium text-[#0a3b7c]" onClick={onNew} data-testid="deals-empty-new">+ Nuovo affare</button></div>;
  return (
    <div className="space-y-2">
      {deals.map((d) => (
        <div key={d.id} className="rounded-md border border-slate-200 p-3" style={{ borderLeft: `3px solid ${FASE_COLORS[d.fase]}` }} data-testid={`person-deal-${d.id}`}>
          <div className="flex items-start justify-between gap-2">
            <button className="text-left text-sm font-semibold text-[#0a3b7c] hover:underline" onClick={() => onOpenDeal(d.id)} data-testid={`person-deal-link-${d.id}`}>{d.titolo}</button>
            <div className="font-mono text-sm">{fmtMoney(d.valore)}</div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select className="crm-select h-7 flex-1 text-xs" value={d.fase} onChange={(e) => setFase(d, e.target.value)} data-testid={`deal-fase-select-${d.id}`}>
              {FASI.map((f) => <option key={f}>{f}</option>)}
            </select>
            <button className="btn-gold h-7 px-2 text-xs" onClick={() => onProposal(d)} data-testid={`button-crea-proposta-${d.id}`}><FileSignature className="h-3.5 w-3.5" />Crea proposta</button>
          </div>
          {proposte.filter((p) => p.crm_deal_id === d.id).map((p) => (
            <button key={p.id} onClick={() => onOpenProp(p.id)} className="mt-2 flex w-full items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-[#0a3b7c]/5" data-testid={`proposal-item-${p.id}`}>
              <span className="font-mono">{p.id}</span><StatoPill stato={p.stato} /><span>{p.aperture.length} aperture</span><span>scade {fmtDate(p.scadenza, "d MMM")}</span><span className="font-mono">{fmtMoney(p.totale)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

const Panoramica = ({ data, person }) => {
  const { userName } = useApp();
  const total = Object.values(data.by_type).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-4 text-sm" data-testid="panoramica">
      <div><div className="mb-1 font-medium">Attività principali</div>
        {Object.entries(data.by_type).map(([t, n]) => (
          <div key={t} className="mb-1.5"><div className="h-2 rounded-full bg-[#C9A227]" style={{ width: `${(n / total) * 100}%` }} />
            <div className="flex justify-between text-xs text-slate-600"><span>{TIPI[t]?.label}</span><span>{n} · {Math.round((n / total) * 100)}%</span></div></div>
        ))}
        {!Object.keys(data.by_type).length && <div className="text-xs text-slate-500">Nessuna attività</div>}
      </div>
      <div><div className="mb-1 font-medium">Utenti più attivi</div>
        {Object.entries(data.by_user).map(([u, n]) => (
          <div key={u} className="mb-1.5"><div className="h-2 rounded-full bg-[#0a3b7c]" style={{ width: `${(n / total) * 100}%` }} />
            <div className="flex justify-between text-xs text-slate-600"><span>{userName(u) || "—"}</span><span>{n}</span></div></div>
        ))}
      </div>
      <div className="flex justify-between text-xs"><span>Inattivo (giorni)</span><span data-testid="inactive-days">{data.inactive_days}</span></div>
      <div className="flex justify-between text-xs"><span>Creato</span><span>{fmtDate(person.created_at)}</span></div>
    </div>
  );
};

export const ActivityRow = ({ a, onChanged }) => {
  const toggle = async () => { try { await api.patch(`/activities/${a.id}`, { done: !a.done }); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const Icon = TIPI[a.tipo]?.Icon || Circle;
  const late = !a.done && a.data < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3" data-testid={`activity-card-${a.id}`}>
      <button onClick={toggle} data-testid={`activity-toggle-${a.id}`}>{a.done ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-green-600" />}</button>
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${a.done ? "text-slate-400 line-through" : ""}`}><Icon className="h-4 w-4" />{a.oggetto}</div>
        <div className={`text-xs ${late ? "text-red-600" : "text-slate-500"}`}>{fmtDate(a.data, "EEE d MMM yyyy")}{a.ora ? ` alle ${a.ora}` : ""}</div>
        {a.note && <div className="mt-2 whitespace-pre-wrap rounded bg-yellow-50 p-2 text-sm">{a.note}</div>}
      </div>
      {!a.done && <QuickReschedule activity={a} onDone={onChanged} />}
    </div>
  );
};

export const Timeline = ({ data, onChanged }) => {
  const [tab, setTab] = useState("tutti");
  const { me, isAdmin } = useApp();
  const items = [
    ...data.notes.map((n) => ({ k: "note", at: n.created_at, n })),
    ...data.activities.filter((a) => a.done).map((a) => ({ k: "attivita", at: a.done_at || a.created_at, a })),
    ...data.history.map((h) => ({ k: ["stage", "deal", "contratti"].includes(h.kind) ? "affari" : "log", at: h.created_at, h })),
  ].filter((i) => tab === "tutti" || i.k === tab).sort((x, y) => (y.at || "").localeCompare(x.at || ""));
  const delNote = async (id) => { try { await api.delete(`/notes/${id}`); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const tabs = [["tutti", "Tutti"], ["note", `Note (${data.notes.length})`], ["attivita", "Attività"], ["affari", "Affari e proposte"], ["log", "Registro modifiche"]];
  return (
    <div data-testid="timeline">
      <div className="mb-3 flex gap-1">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded px-2.5 py-1 text-xs font-semibold ${tab === k ? "bg-[#0a3b7c]/10 text-[#0a3b7c]" : "text-slate-600 hover:bg-slate-100"}`} data-testid={`timeline-tab-${k}`}>{l}</button>)}
      </div>
      <div className="relative space-y-3 border-l-2 border-slate-200 pl-5">
        {items.map((i, idx) => (
          <div key={idx} className="relative">
            <div className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
            {i.n && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3" data-testid={`timeline-note-${i.n.id}`}>
                <div className="flex justify-between text-xs text-slate-500"><span>{fmtDateTime(i.at)} · {i.n.author_name}</span>
                  {(isAdmin || i.n.author_id === me.user_id) && <button onClick={() => delNote(i.n.id)} data-testid={`delete-note-${i.n.id}`}><X className="h-3.5 w-3.5" /></button>}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{i.n.content}</div>
              </div>
            )}
            {i.a && <div className="text-sm"><span className="font-semibold">{TIPI[i.a.tipo]?.label}: {i.a.oggetto}</span> <span className="text-xs text-slate-500">· completata {fmtDateTime(i.at)}</span>
              {i.a.note && <div className="mt-1 whitespace-pre-wrap rounded bg-yellow-50 p-2 text-sm">{i.a.note}</div>}</div>}
            {i.h && <div className="text-sm"><span className={i.h.kind === "contratti" || i.h.kind === "stage" ? "font-medium text-[#0a3b7c]" : ""}>{i.h.text}</span><div className="text-xs text-slate-500">{fmtDateTime(i.at)} · {i.h.user_name}</div></div>}
          </div>
        ))}
        {!items.length && <div className="text-sm text-slate-500">Nessun elemento</div>}
      </div>
    </div>
  );
};

export default function PersonDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { userName, isAdmin, team, config } = useApp();
  const [data, setData] = useState(null);
  const [proposte, setProposte] = useState([]);
  const [mode, setMode] = useState("esempio");
  const [tab, setTab] = useState("note");
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [propDeal, setPropDeal] = useState(null);
  const [openProp, setOpenProp] = useState(null);
  const load = useCallback(() => {
    api.get(`/persons/${id}`).then((r) => setData(r.data)).catch(() => { toast.error("Contatto non trovato"); nav("/contatti"); });
    api.get("/contratti/proposte", { params: { person_id: id } }).then((r) => setProposte(r.data)).catch(() => setProposte([]));
  }, [id, nav]);
  useEffect(() => { load(); api.get("/contratti/stato").then((r) => setMode(r.data.modalita)); }, [load]);
  if (!data) return <div className="p-10 text-sm text-slate-500">Caricamento…</div>;
  const p = data.person;
  const planned = data.activities.filter((a) => !a.done);

  const saveLabels = async (etichette) => { try { await api.patch(`/persons/${id}`, { etichette }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const addNote = async () => { if (!note.trim()) return; try { await api.post("/notes", { content: note, person_id: id }); setNote(""); toast.success("Nota salvata"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const take = async () => { try { await api.post(`/persons/${id}/take`); toast.success("Lead preso"); load(); } catch (e) { toast.error(errMsg(e)); load(); } };
  const assign = async (uid) => { try { await api.post(`/persons/${id}/assign`, { owner_id: uid }); toast.success("Proprietario aggiornato"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async () => { if (!window.confirm(`Eliminare ${p.full_name}?`)) return; await api.delete(`/persons/${id}`); toast.success("Contatto eliminato"); nav("/contatti"); };

  return (
    <div className="flex min-h-full flex-col fade-in" data-testid="person-detail">
      <div className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0a3b7c] font-display text-white">{initials(p.full_name)}</div>
        <h1 className="font-display text-2xl font-semibold text-slate-900" data-testid="person-name">{p.full_name}</h1>
        {p.da_assegnare && <span className="rounded bg-[#C9A227]/20 px-2 py-0.5 text-xs font-bold uppercase text-[#7a6214]" data-testid="badge-da-assegnare">Da assegnare</span>}
        <div className="ml-auto flex items-center gap-2">
          <div className="mr-2 text-right text-sm">
            {isAdmin ? (
              <select className="crm-select h-8" value={p.owner_id || ""} onChange={(e) => e.target.value && assign(e.target.value)} data-testid="person-owner-select">
                <option value="">— nessuno —</option>{team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
            ) : <div className="font-medium" data-testid="person-owner">{userName(p.owner_id) || "—"}</div>}
            <div className="text-xs text-slate-500">Proprietario</div>
          </div>
          {p.da_assegnare && <button className="btn-gold" onClick={take} data-testid="button-prendo-io"><Hand className="h-4 w-4" />Prendo io</button>}
          <button className="btn-primary" onClick={() => setDealOpen(true)} data-testid="add-deal-btn"><Plus className="h-4 w-4" />Affare</button>
          {isAdmin && <button className="btn-ghost px-2 text-red-600" onClick={del} data-testid="delete-person-btn"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[440px] shrink-0 border-r border-slate-200 bg-white">
          <Section title="Riepilogo" testid="section-riepilogo">
            <div className="space-y-2 text-sm">
              <LabelPicker value={p.etichette || []} onChange={saveLabels} testid="person-labels" />
              {p.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><a href={`mailto:${p.email}`} className="text-[#0a3b7c]" data-testid="person-email">{p.email}</a></div>}
              {p.telefono && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /><a href={`tel:${p.telefono}`} className="text-[#0a3b7c]" data-testid="person-phone">{p.telefono}</a></div>}
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" />
                {data.org ? <button className="text-[#0a3b7c]" onClick={() => nav(`/organizzazioni/${data.org.id}`)}>{data.org.nome}</button> : <span className="text-slate-500">Nessuna organizzazione</span>}</div>
            </div>
          </Section>
          <Section title="Dettagli" testid="section-dettagli" action={<button onClick={() => setEdit(true)} className="rounded p-1 hover:bg-slate-100" data-testid="edit-person-btn"><Pencil className="h-4 w-4 text-slate-500" /></button>}>
            <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm">
              {DETAILS.map(([k, l]) => (
                <div key={k} className="contents"><dt className="text-right text-xs leading-5 text-slate-500">{l}</dt>
                  <dd data-testid={`detail-${k}`}>{(k === "primo_contatto" ? fmtDate(p[k]) : p[k]) || "–"}</dd></div>
              ))}
            </dl>
          </Section>
          <Section title="Affari" testid="section-affari" action={<button onClick={() => setDealOpen(true)} className="rounded p-1 hover:bg-slate-100" data-testid="section-add-deal"><Plus className="h-4 w-4" /></button>}>
            <DealsBlock deals={data.deals} proposte={proposte} onNew={() => setDealOpen(true)} onChanged={load} onProposal={setPropDeal} onOpenProp={setOpenProp} onOpenDeal={(did) => nav(`/affari/${did}`)} />
          </Section>
          <Section title="Panoramica" testid="section-panoramica"><Panoramica data={data.panoramica} person={p} /></Section>
          <div className="px-5 py-4 text-xs text-slate-500">Aggiornato: {fmtDateTime(p.updated_at)} · Creato: {fmtDateTime(p.created_at)} · Origine: {p.source}</div>
        </aside>
        <div className="min-w-0 flex-1 space-y-6 p-6">
          <div className="crm-card overflow-hidden">
            <div className="flex border-b border-slate-200">
              {[["note", "Note", StickyNote], ["attivita", "Attività", CalendarCheck]].map(([k, l, I]) => (
                <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${tab === k ? "border-b-2 border-[#0a3b7c] text-[#0a3b7c]" : "text-slate-600"}`} data-testid={`contact-detail-tab-${k}`}><I className="h-4 w-4" />{l}</button>
              ))}
            </div>
            {tab === "note" ? (
              <div className="p-3">
                <textarea className="min-h-[70px] w-full rounded-md border border-slate-200 p-2 text-sm outline-none focus:border-[#0a3b7c]" placeholder="Scrivi una nota…" value={note} onChange={(e) => setNote(e.target.value)} data-testid="note-input" />
                <div className="flex justify-end"><button className="btn-primary" onClick={addNote} data-testid="note-save-btn">Salva nota</button></div>
              </div>
            ) : <ActivityForm person={p} deals={data.deals} onSaved={load} />}
          </div>
          <div>
            <h3 className="mb-3 font-display text-base font-semibold">Nell'occhio del mirino</h3>
            <div className="space-y-2" data-testid="planned-activities">
              {planned.map((a) => <ActivityRow key={a.id} a={a} onChanged={load} />)}
              {!planned.length && <div className="text-center text-sm text-slate-500">Nessuna attività pianificata. <button className="font-medium text-[#0a3b7c]" onClick={() => setTab("attivita")} data-testid="plan-activity-link">+ Pianifica un'attività</button></div>}
            </div>
          </div>
          <div><h3 className="mb-3 font-display text-base font-semibold">Cronologia</h3><Timeline data={data} onChanged={load} /></div>
        </div>
      </div>
      <PersonDialog open={edit} onOpenChange={setEdit} person={p} onSaved={load} />
      <DealDialog open={dealOpen} onOpenChange={setDealOpen} person={p} onSaved={load} />
      <ProposalDialog open={!!propDeal} onOpenChange={(o) => !o && setPropDeal(null)} deal={propDeal} onSaved={(pr) => { load(); setOpenProp(pr.id); }} />
      <ProposalPanel propId={openProp} onOpenChange={() => setOpenProp(null)} onChanged={load} mode={mode} />
      <span className="hidden">{config.contratti_url}</span>
    </div>
  );
}
