import { useCallback, useEffect, useState } from "react";
import { Send, RotateCw, CalendarPlus, KeyRound, FileText, ExternalLink, Eye, Bell, CreditCard, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, errMsg } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/constants";

export const STATO_COLORS = {
  bozza: "bg-slate-100 text-slate-700", inviata: "bg-blue-100 text-blue-800", aperta: "bg-indigo-100 text-indigo-800",
  accettata: "bg-green-100 text-green-800", pagata: "bg-emerald-600 text-white", scaduta: "bg-orange-100 text-orange-800", persa: "bg-red-100 text-red-800",
};
export const StatoPill = ({ stato }) => <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase ${STATO_COLORS[stato] || "bg-slate-100"}`}>{stato}</span>;

const Block = ({ title, Icon, children, testid }) => (
  <section className="border-b border-slate-100 py-4" data-testid={testid}>
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon className="h-4 w-4 text-[#0a3b7c]" />{title}</h4>
    {children}
  </section>
);

const Reminder = ({ r, onSave }) => {
  const [v, setV] = useState(r.data_ora.slice(0, 16));
  return (
    <div className="flex items-center gap-2 text-sm" data-testid={`reminder-${r.id}`}>
      <input type="datetime-local" className="crm-input h-8 w-52" value={v} disabled={r.stato !== "programmato"} onChange={(e) => setV(e.target.value)} data-testid={`reminder-input-${r.id}`} />
      <span className="text-xs text-slate-500">{r.stato}</span>
      {r.stato === "programmato" && v !== r.data_ora.slice(0, 16) && <button className="btn-primary h-8 text-xs" onClick={() => onSave(r.id, v)} data-testid={`reminder-save-${r.id}`}>Salva</button>}
    </div>
  );
};

export const ProposalPanel = ({ propId, onOpenChange, onChanged, mode }) => {
  const [p, setP] = useState(null);
  const [proroga, setProroga] = useState("");
  const load = useCallback(() => propId && api.get(`/contratti/proposte/${propId}`).then((r) => { setP(r.data); setProroga(r.data.scadenza); }), [propId]);
  useEffect(() => { setP(null); load(); }, [load]);
  const act = async (fn, ok) => {
    try { const r = await fn(); if (r?.data?.id) setP(r.data); else load(); toast.success(ok); onChanged?.(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const base = `/contratti/proposte/${propId}`;
  const pag = p?.pagamento;
  return (
    <Sheet open={!!propId} onOpenChange={(o) => !o && onOpenChange()}>
      <SheetContent className="w-[560px] overflow-y-auto sm:max-w-[560px]" data-testid="proposal-panel">
        {!p ? <div className="p-6 text-sm text-slate-500">Caricamento…</div> : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-display">{p.id} <StatoPill stato={p.stato} /></SheetTitle>
              <div className="text-sm text-slate-600">{p.cliente.nome} · <span className="font-mono">{fmtMoney(p.totale)}</span> · scade il {fmtDate(p.scadenza)}</div>
            </SheetHeader>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.stato === "bozza" && <button className="btn-gold" onClick={() => act(() => api.post(`${base}/invia`), "Proposta inviata")} data-testid="proposal-invia-btn"><Send className="h-4 w-4" />Invia proposta</button>}
              {p.stato !== "bozza" && <button className="btn-ghost" onClick={() => act(() => api.post(`${base}/reinvia`), "Mail reinviata")} data-testid="proposal-reinvia-btn"><RotateCw className="h-4 w-4" />Reinvia mail</button>}
              <a className="btn-ghost" href={p.url_pubblico} target="_blank" rel="noreferrer" data-testid="proposal-open-link"><ExternalLink className="h-4 w-4" />Apri in contratti</a>
            </div>
            <Block title="Prodotti" Icon={FileText} testid="proposal-righe">
              {p.righe.map((r) => <div key={r.prodotto_id} className="flex justify-between text-sm"><span>{r.nome} × {r.quantita}{r.sconto_pct ? ` (−${r.sconto_pct}%)` : ""}</span><span className="font-mono">{fmtMoney(r.totale)}</span></div>)}
            </Block>
            <Block title={`Aperture (${p.aperture.length})`} Icon={Eye} testid="proposal-aperture">
              {p.aperture.length ? p.aperture.map((a, i) => <div key={i} className="text-sm text-slate-700">{fmtDateTime(a.at)} · {a.dispositivo}</div>) : <div className="text-sm text-slate-500">Non ancora aperta</div>}
              {p.inviata_at && <div className="mt-1 text-xs text-slate-500">Inviata il {fmtDateTime(p.inviata_at)}</div>}
            </Block>
            <Block title="Promemoria automatici" Icon={Bell} testid="proposal-promemoria">
              <div className="space-y-2">{p.promemoria.length ? p.promemoria.map((r) => (
                <Reminder key={r.id + r.data_ora} r={r} onSave={(id, v) => act(() => api.patch(`${base}/promemoria`, { promemoria_id: id, data_ora: v }), "Promemoria aggiornato")} />
              )) : <div className="text-sm text-slate-500">Programmati all'invio della proposta</div>}</div>
            </Block>
            <Block title="Scadenza" Icon={CalendarPlus} testid="proposal-scadenza-block">
              <div className="flex items-center gap-2">
                <input type="date" className="crm-input h-8 w-44" value={proroga} onChange={(e) => setProroga(e.target.value)} data-testid="proposal-proroga-input" />
                <button className="btn-primary h-8 text-xs" disabled={proroga <= p.scadenza} onClick={() => act(() => api.post(`${base}/proroga`, { scadenza: proroga }), "Scadenza prorogata")} data-testid="proposal-proroga-btn">Proroga</button>
              </div>
            </Block>
            <Block title="Pagamento" Icon={CreditCard} testid="proposal-pagamento-block">
              <div className="text-sm">
                <div>Modalità: <b className="capitalize">{pag.modalita}</b> · Stato: <b data-testid="proposal-pagamento-stato">{pag.stato.replace("_", " ")}</b> · Pagato {fmtMoney(pag.importo_pagato)} di {fmtMoney(p.totale)}</div>
                {pag.modalita === "bonifico" && <div className="mt-1 font-mono text-xs text-slate-600">IBAN {pag.iban}</div>}
                {pag.link_pagamento && <a href={pag.link_pagamento} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-[#0a3b7c] underline">{pag.link_pagamento}</a>}
                {pag.rate?.length > 0 && <div className="mt-2 space-y-0.5">{pag.rate.map((r) => (
                  <div key={r.n} className="flex justify-between text-xs"><span>Rata {r.n} · {fmtDate(r.scadenza, "d MMM yyyy")}</span><span className={r.pagata ? "text-green-700" : "text-slate-500"}>{fmtMoney(r.importo)} {r.pagata ? "pagata" : "da pagare"}</span></div>
                ))}</div>}
              </div>
            </Block>
            <Block title="Accesso LMS" Icon={KeyRound} testid="proposal-lms-block">
              <div className="flex items-center justify-between text-sm">
                <span>{p.lms.stato === "attivo" ? <>Utente <b>{p.lms.username}</b> · inviate {p.lms.inviate_at.length} volte</> : "Credenziali non ancora create"}</span>
                <button className="btn-ghost h-8 text-xs" onClick={() => act(() => api.post(`${base}/lms`), "Credenziali LMS inviate")} data-testid="proposal-lms-btn">{p.lms.stato === "attivo" ? "Reinvia credenziali" : "Crea credenziali"}</button>
              </div>
            </Block>
            <Block title="Fattura" Icon={FileText} testid="proposal-fattura-block">
              {p.fattura ? <a href={p.fattura.pdf_url} target="_blank" rel="noreferrer" className="text-sm text-[#0a3b7c] underline" data-testid="proposal-fattura-link">Fattura {p.fattura.numero} del {fmtDate(p.fattura.data)} · {fmtMoney(p.fattura.importo)}</a>
                : <div className="text-sm text-slate-500">Non ancora emessa</div>}
            </Block>
            <Block title="Mail inviate" Icon={Send} testid="proposal-email-log">
              {p.email_log.length ? p.email_log.map((m, i) => <div key={i} className="text-xs text-slate-600">{fmtDateTime(m.at)} · {m.tipo} · {m.da}</div>) : <div className="text-sm text-slate-500">Nessuna</div>}
            </Block>
            {mode === "esempio" && p.stato !== "bozza" && (
              <div className="mt-4 rounded-md border border-dashed border-amber-400 bg-amber-50 p-3" data-testid="proposal-simulate">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><FlaskConical className="h-3.5 w-3.5" />DATI DI ESEMPIO · simula cosa farà il gestionale contratti</div>
                <div className="flex flex-wrap gap-1.5">
                  {[["apertura", "Cliente apre"], ["promemoria", "Invia promemoria"], ["accettata", "Cliente accetta"], ["pagamento", "Pagamento ricevuto"], ["perso", "Cliente rifiuta"]].map(([k, l]) => (
                    <button key={k} className="rounded border border-amber-300 bg-white px-2 py-1 text-xs hover:bg-amber-100" onClick={() => act(() => api.post(`${base}/simula`, { evento: k }), l)} data-testid={`simulate-${k}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
