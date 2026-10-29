import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banknote, Building2, User, Tag, Flag, Pencil, FileSignature, Trash2, StickyNote, CalendarCheck, RotateCcw, Trophy, XCircle, Mail, Phone, Check } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { FASI, FASE_COLORS, AUTO_FASI, fmtDate, fmtDateTime, fmtMoney, initials } from "@/lib/constants";
import { LabelList } from "@/components/LabelPill";
import { ActivityForm } from "@/components/ActivityForm";
import { ProductMulti } from "@/components/ProductSelect";
import { NewProposal } from "@/components/NewProposal";
import { ProposalPanel, StatoPill } from "@/components/ProposalPanel";
import { Section, ActivityRow, Timeline } from "@/pages/PersonDetail";

const OPEN_FASI = FASI.slice(0, 4);
const LABEL_STYLE = { "Molto probabile": "bg-green-100 text-green-800", "Probabile": "bg-blue-100 text-blue-800", "Ci pensa": "bg-yellow-100 text-yellow-800", "Poco probabile": "bg-slate-200 text-slate-700" };

const StageBar = ({ deal, days, onSet }) => {
  const idx = OPEN_FASI.indexOf(deal.fase);
  const closed = deal.status !== "open";
  return (
    <div className="flex gap-0.5" data-testid="deal-stage-bar">
      {OPEN_FASI.map((f, i) => {
        const done = closed ? deal.status === "won" : i <= idx;
        return (
          <button key={f} onClick={() => onSet(f)} title={AUTO_FASI.includes(f) ? "Aggiornata in automatico dal gestionale contratti" : ""}
            className={`relative h-7 flex-1 px-3 text-[11px] font-medium transition-colors [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]
              ${done ? "bg-green-500 text-white" : closed && deal.status === "lost" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-600 hover:bg-slate-300"}`}
            data-testid={`stage-${f.toLowerCase().replace(/\s+/g, "-")}`}>
            {i === idx && !closed ? `${days}g · ` : ""}{f}
          </button>
        );
      })}
    </div>
  );
};

const Row = ({ Icon, children }) => <div className="flex items-start gap-2.5 text-sm"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0 flex-1">{children}</div></div>;

const Summary = ({ data, onSave }) => {
  const { team, isAdmin, me } = useApp();
  const d = data.deal;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  useEffect(() => { setF({ titolo: d.titolo, valore: d.valore, etichetta: d.etichetta || "", data_prevista: d.data_prevista || "", owner_id: d.owner_id || "" }); }, [d]);
  const save = async () => {
    if (!f.titolo?.trim()) return toast.error("Titolo obbligatorio");
    if (await onSave({ ...f, valore: Number(f.valore) || 0, etichetta: f.etichetta || null, data_prevista: f.data_prevista || null, owner_id: f.owner_id || null })) setEdit(false);
  };
  if (edit) {
    return (
      <div className="space-y-2" data-testid="deal-edit-form">
        <input className="crm-input" value={f.titolo} onChange={(e) => setF({ ...f, titolo: e.target.value })} data-testid="deal-edit-titolo" />
        <input type="number" className="crm-input" value={f.valore} onChange={(e) => setF({ ...f, valore: e.target.value })} data-testid="deal-edit-valore" />
        <select className="crm-select w-full" value={f.etichetta} onChange={(e) => setF({ ...f, etichetta: e.target.value })} data-testid="deal-edit-etichetta">
          <option value="">Nessuna etichetta</option>{data.labels.map((l) => <option key={l}>{l}</option>)}
        </select>
        <label className="block text-xs text-slate-600">Data di conclusione prevista<input type="date" className="crm-input mt-1" value={f.data_prevista} onChange={(e) => setF({ ...f, data_prevista: e.target.value })} data-testid="deal-edit-data-prevista" /></label>
        {(isAdmin || d.owner_id === me.user_id || !d.owner_id) && (
          <select className="crm-select w-full" value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })} data-testid="deal-edit-owner">
            <option value="">— nessuno —</option>{team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
          </select>
        )}
        <div className="flex justify-end gap-2"><button className="btn-ghost h-8" onClick={() => setEdit(false)}>Annulla</button><button className="btn-primary h-8" onClick={save} data-testid="deal-edit-save">Salva</button></div>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <div className="flex justify-end -mt-9 mb-1"><button onClick={() => setEdit(true)} className="rounded p-1 hover:bg-slate-100" data-testid="deal-edit-btn"><Pencil className="h-4 w-4 text-slate-500" /></button></div>
      <Row Icon={Banknote}><span className="font-mono font-semibold" data-testid="deal-valore">{fmtMoney(d.valore)}</span></Row>
      <Row Icon={Building2}>{data.org ? data.org.nome : <span className="text-slate-500">Nessuna organizzazione</span>}</Row>
      <Row Icon={User}>{data.person ? <span className="text-[#0a3b7c]" data-testid="deal-person-link">{data.person.full_name}</span> : "—"}</Row>
      <Row Icon={Tag}>{d.etichetta ? <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase ${LABEL_STYLE[d.etichetta] || "bg-slate-100"}`} data-testid="deal-etichetta">{d.etichetta}</span> : <span className="text-slate-500">Nessuna etichetta</span>}</Row>
      <Row Icon={Flag}>{d.data_prevista ? `Conclusione prevista: ${fmtDate(d.data_prevista)}` : <span className="text-slate-500">Data di conclusione prevista non impostata</span>}</Row>
    </div>
  );
};

const Products = ({ data, onSave }) => {
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState(data.deal.prodotti || []);
  useEffect(() => { setSel(data.deal.prodotti || []); }, [data.deal.prodotti]);
  if (edit) return (
    <div className="space-y-2"><ProductMulti value={sel} onChange={setSel} />
      <div className="flex justify-end gap-2"><button className="btn-ghost h-8" onClick={() => setEdit(false)}>Annulla</button><button className="btn-primary h-8" onClick={async () => { await onSave({ prodotti: sel }); setEdit(false); }} data-testid="deal-products-save">Salva</button></div>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {data.products.map((p) => (
        <div key={p.id} className="flex justify-between text-sm" data-testid={`deal-product-row-${p.id}`}>
          <span>{p.nome} <span className="text-xs text-slate-500">· {p.erogatore}</span></span>
          <span className="flex items-center gap-2"><a href={p.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-[#0a3b7c] underline">PDF</a><span className="font-mono text-xs">{fmtMoney(p.prezzo)}</span></span>
        </div>
      ))}
      <button className="text-sm font-medium text-[#0a3b7c]" onClick={() => setEdit(true)} data-testid="deal-add-product">+ {data.products.length ? "Modifica prodotti" : "Aggiungi prodotto"}</button>
    </div>
  );
};

export default function DealDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin, userName } = useApp();
  const [data, setData] = useState(null);
  const [proposte, setProposte] = useState([]);
  const [mode, setMode] = useState("esempio");
  const [tab, setTab] = useState("note");
  const [note, setNote] = useState("");
  const [propOpen, setPropOpen] = useState(false);
  const [openProp, setOpenProp] = useState(null);
  const load = useCallback(() => {
    api.get(`/deals/${id}`).then((r) => setData(r.data)).catch(() => { toast.error("Affare non trovato"); nav("/affari"); });
    api.get("/contratti/proposte", { params: { deal_id: id } }).then((r) => setProposte(r.data)).catch(() => setProposte([]));
  }, [id, nav]);
  useEffect(() => { load(); api.get("/contratti/stato").then((r) => setMode(r.data.modalita)); }, [load]);
  if (!data) return <div className="p-10 text-sm text-slate-500">Caricamento…</div>;
  const d = data.deal;
  const p = data.person;
  const patch = async (body, ok = "Affare aggiornato") => { try { await api.patch(`/deals/${id}`, body); toast.success(ok); load(); return true; } catch (e) { toast.error(errMsg(e)); return false; } };
  const addNote = async () => { if (!note.trim()) return; try { await api.post("/notes", { content: note, deal_id: id, person_id: d.person_id }); setNote(""); toast.success("Nota salvata"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const del = async () => { if (!window.confirm(`Eliminare l'affare ${d.titolo}?`)) return; try { await api.delete(`/deals/${id}`); toast.success("Affare eliminato"); nav("/affari"); } catch (e) { toast.error(errMsg(e)); } };
  const planned = data.activities.filter((a) => !a.done);
  const statusBadge = d.status === "won" ? "bg-green-600 text-white" : d.status === "lost" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700";

  return (
    <div className="flex min-h-full flex-col fade-in" data-testid="deal-detail">
      <div className="space-y-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-slate-900" data-testid="deal-title">{d.titolo}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="mr-2 flex items-center gap-2 text-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a3b7c] text-xs font-bold text-white">{initials(userName(d.owner_id) || "?")}</span>
              <div><div className="font-medium" data-testid="deal-owner">{userName(d.owner_id) || d.owner_import || "—"}</div><div className="text-xs text-slate-500">Proprietario</div></div>
            </div>
            <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${statusBadge}`} data-testid="deal-status-badge">{d.status === "open" ? "In corso" : d.fase}</span>
            {d.status === "open" ? (
              <>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700" onClick={() => patch({ fase: "Aggiudicato" }, "Affare aggiudicato")} data-testid="deal-won-btn"><Trophy className="h-4 w-4" />Aggiudicato</button>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700" onClick={() => patch({ fase: "Perso" }, "Affare perso")} data-testid="deal-lost-btn"><XCircle className="h-4 w-4" />Perso</button>
              </>
            ) : <button className="btn-ghost" onClick={() => patch({ fase: d.fase_prev || "Contatto chiamato" }, "Affare riaperto")} data-testid="deal-reopen-btn"><RotateCcw className="h-4 w-4" />Riapri</button>}
            <button className="btn-gold" onClick={() => setPropOpen(true)} data-testid="deal-crea-proposta-btn"><FileSignature className="h-4 w-4" />Crea proposta</button>
            {isAdmin && <button className="btn-ghost px-2 text-red-600" onClick={del} data-testid="delete-deal-btn"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
        <StageBar deal={d} days={data.panoramica.in_fase_giorni} onSet={(f) => f !== d.fase && patch({ fase: f }, `Fase: ${f}`)} />
        <div className="text-xs text-slate-500">Pipeline → <span className="text-[#0a3b7c]">{d.fase}</span>{d.motivo_perso ? ` · Motivo: ${d.motivo_perso}` : ""}</div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[440px] shrink-0 border-r border-slate-200 bg-white">
          <Section title="Riepilogo" testid="deal-section-riepilogo"><Summary data={data} onSave={(b) => patch(b)} /></Section>
          <Section title="Proposte" testid="deal-section-proposte" action={<button onClick={() => setPropOpen(true)} className="text-sm font-medium text-[#0a3b7c]" data-testid="deal-section-new-proposal">+ Nuova</button>}>
            <div className="space-y-1.5">
              {proposte.map((pr) => (
                <button key={pr.id} onClick={() => setOpenProp(pr.id)} className="flex w-full items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-2 text-left text-xs hover:border-[#0a3b7c]" data-testid={`deal-proposal-${pr.id}`}>
                  <span className="font-mono font-semibold">{pr.id}</span><StatoPill stato={pr.stato} />
                  <span>{pr.aperture.length} aperture</span><span>pag. {pr.pagamento.stato.replace("_", " ")}</span><span className="font-mono">{fmtMoney(pr.totale)}</span>
                </button>
              ))}
              {!proposte.length && <div className="text-sm text-slate-500">Nessuna proposta. Usa “Crea proposta”.</div>}
            </div>
          </Section>
          <Section title="Dettagli" testid="deal-section-dettagli">
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-sm">
              {[["Data di aggiudicazione", d.status === "won" ? fmtDate(d.closed_at) : "–"], ["Data di chiusura", d.status !== "open" ? fmtDate(d.closed_at) : "–"],
                ["In questa fase da", `${data.panoramica.in_fase_giorni} giorni`], ["Origine", d.origine || "–"]].map(([l, v]) => (
                <div key={l} className="contents"><dt className="text-right text-xs leading-5 text-slate-500">{l}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Section>
          <Section title="Persona" testid="deal-section-persona">
            {p ? (
              <div className="space-y-1.5 text-sm">
                <button className="flex items-center gap-2 font-medium text-[#0a3b7c]" onClick={() => nav(`/persone/${p.id}`)} data-testid="deal-person-open"><User className="h-4 w-4" />{p.full_name}</button>
                {p.telefono && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /><a href={`tel:${p.telefono}`} className="text-[#0a3b7c]">{p.telefono}</a></div>}
                {p.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><a href={`mailto:${p.email}`} className="text-[#0a3b7c]">{p.email}</a></div>}
                <LabelList labels={p.etichette} max={4} />
                <dl className="mt-2 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5">
                  {[["Professione", p.professione], ["Primo contatto", fmtDate(p.primo_contatto)], ["Prodotto richiesto", p.prodotto_richiesto], ["Tipo marketing", p.tipo_marketing], ["Città", p.citta], ["Privacy", p.privacy]].map(([l, v]) => (
                    <div key={l} className="contents"><dt className="text-right text-xs leading-5 text-slate-500">{l}</dt><dd>{v || "–"}</dd></div>
                  ))}
                </dl>
              </div>
            ) : <div className="text-sm text-slate-500">Nessuna persona collegata</div>}
          </Section>
          <Section title="Prodotti" testid="deal-section-prodotti"><Products data={data} onSave={(b) => patch(b, "Prodotti aggiornati")} /></Section>
          <Section title="Panoramica" testid="deal-section-panoramica">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Età dell'affare</span><span data-testid="deal-age">{data.panoramica.eta_giorni} giorni</span></div>
              <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(100, data.panoramica.eta_giorni * 3 + 4)}%`, background: FASE_COLORS[d.fase] }} /></div>
              <div className="flex justify-between"><span>Inattivo (giorni)</span><span>{data.panoramica.inactive_days}</span></div>
              <div className="flex justify-between"><span>Creato</span><span>{fmtDate(d.created_at)}</span></div>
            </div>
          </Section>
          <div className="px-5 py-4 text-xs text-slate-500">Aggiornato: {fmtDateTime(d.updated_at)} · Creato: {fmtDateTime(d.created_at)}</div>
        </aside>
        <div className="min-w-0 flex-1 space-y-6 p-6">
          <div className="crm-card overflow-hidden">
            <div className="flex border-b border-slate-200">
              {[["note", "Note", StickyNote], ["attivita", "Attività", CalendarCheck]].map(([k, l, I]) => (
                <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${tab === k ? "border-b-2 border-[#0a3b7c] text-[#0a3b7c]" : "text-slate-600"}`} data-testid={`deal-detail-tab-${k}`}><I className="h-4 w-4" />{l}</button>
              ))}
            </div>
            {tab === "note" ? (
              <div className="p-3">
                <textarea className="min-h-[70px] w-full rounded-md border border-slate-200 p-2 text-sm outline-none focus:border-[#0a3b7c]" placeholder="Scrivi una nota sull'affare…" value={note} onChange={(e) => setNote(e.target.value)} data-testid="deal-note-input" />
                <div className="flex justify-end"><button className="btn-primary" onClick={addNote} data-testid="deal-note-save-btn"><Check className="h-4 w-4" />Salva nota</button></div>
              </div>
            ) : p ? <ActivityForm person={p} deals={[d]} defaultDealId={d.id} onSaved={load} /> : <div className="p-4 text-sm text-slate-500">Collega una persona all'affare per pianificare attività.</div>}
          </div>
          <div>
            <h3 className="mb-3 font-display text-base font-semibold">Nell'occhio del mirino</h3>
            <div className="space-y-2" data-testid="deal-planned-activities">
              {planned.map((a) => <ActivityRow key={a.id} a={a} onChanged={load} />)}
              {!planned.length && <div className="text-center text-sm text-slate-500">Nessuna attività pianificata. <button className="font-medium text-[#0a3b7c]" onClick={() => setTab("attivita")} data-testid="deal-plan-activity-link">+ Pianifica un'attività</button></div>}
            </div>
          </div>
          <div><h3 className="mb-3 font-display text-base font-semibold">Cronologia dell'affare</h3><Timeline data={data} onChanged={load} /></div>
        </div>
      </div>
      <NewProposal open={propOpen} onOpenChange={setPropOpen} deal={d} person={data.person} onDeal={load} onProposal={(pr) => { load(); setOpenProp(pr.id); }} />
      <ProposalPanel propId={openProp} onOpenChange={() => setOpenProp(null)} onChanged={load} mode={mode} />
    </div>
  );
}
