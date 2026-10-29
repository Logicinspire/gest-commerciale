import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { fmtDateTime, fmtMoney } from "@/lib/constants";

const BASE = process.env.REACT_APP_BACKEND_URL;
const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copiato"); };

const Field = ({ label, value, testid }) => (
  <div className="mb-2">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="flex items-center gap-2"><code className="flex-1 truncate rounded bg-slate-100 px-2 py-1.5 font-mono text-xs" data-testid={testid}>{value}</code>
      <button onClick={() => copy(value)} className="rounded p-1.5 hover:bg-slate-100"><Copy className="h-4 w-4" /></button></div>
  </div>
);

const Card = ({ title, children, testid }) => <div className="crm-card p-5" data-testid={testid}><h3 className="mb-3 font-display text-base font-semibold">{title}</h3>{children}</div>;

const Code = ({ children }) => <pre className="mt-2 overflow-auto rounded bg-[#071c38] p-3 font-mono text-[11px] leading-relaxed text-slate-100">{children}</pre>;

export default function IntegrationsPage() {
  const { isAdmin, loadProducts } = useApp();
  const [cfg, setCfg] = useState(null);
  const [mode, setMode] = useState("");
  const [prod, setProd] = useState({ items: [], sync: {} });
  const loadProd = () => api.get("/products", { params: { all: true } }).then((r) => setProd(r.data));
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/admin/integrations").then((r) => setCfg(r.data));
    api.get("/contratti/stato").then((r) => setMode(r.data.modalita));
    loadProd();
  }, [isAdmin]);
  if (!isAdmin) return <div className="p-10 text-sm text-slate-500">Accesso riservato all'amministratore.</div>;
  if (!cfg) return null;
  const sync = async () => { try { const r = await api.post("/products/sync"); toast.success(`${r.data.count} prodotti (${r.data.source})`); loadProd(); loadProducts(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="max-w-5xl space-y-5 p-6 fade-in" data-testid="integrations-page">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Collegamenti</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${mode === "live" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`} data-testid="contratti-mode">
          Gestionale contratti: {mode === "live" ? "collegato" : "dati di esempio"}</span>
      </div>
      <Card title="Catalogo prodotti (sola lettura da contratti)" testid="products-card">
        <div className="mb-3 flex items-center gap-3 text-sm text-slate-600">
          Ultimo aggiornamento: {fmtDateTime(prod.sync.at)} · fonte <b>{prod.sync.source}</b> · aggiornamento automatico ogni ora
          <button className="btn-ghost ml-auto h-8" onClick={sync} data-testid="products-sync-btn"><RefreshCw className="h-4 w-4" />Aggiorna ora</button>
        </div>
        <table className="w-full border-collapse text-sm" data-testid="products-table">
          <thead><tr><th className="th">Nome</th><th className="th">Prezzo</th><th className="th">Minimo</th><th className="th">Erogatore</th><th className="th">Tipo</th><th className="th">Incluso in</th><th className="th">Scheda</th><th className="th">Attivo</th></tr></thead>
          <tbody>{prod.items.map((p) => (
            <tr key={p.id}><td className="td">{p.nome}</td><td className="td font-mono">{fmtMoney(p.prezzo)}</td><td className="td font-mono">{fmtMoney(p.prezzo_minimo)}</td><td className="td">{p.erogatore}</td>
              <td className="td">{p.tipo}</td><td className="td text-xs">{p.incluso_in || "—"}</td><td className="td"><a className="text-xs text-[#0a3b7c] underline" href={p.pdf_url} target="_blank" rel="noreferrer">PDF</a></td><td className="td">{p.attivo ? "Sì" : "No"}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="API del gestionale contratti (comandi dal commerciale)" testid="contratti-api-card">
        <p className="text-sm text-slate-600">Quando le API di contratti saranno pronte, imposta <code>CONTRATTI_API_URL</code> e <code>CONTRATTI_API_KEY</code>: il gestionale commerciale passerà automaticamente dai dati di esempio ai dati reali. Ogni chiamata invia <code>X-Api-Key</code> e <code>X-Acting-User</code> (email del commerciale loggato).</p>
        <Code>{`GET    /prodotti                         catalogo (id, nome, prezzo, prezzo_minimo, erogatore, tipo, incluso_in, pdf_url, attivo)
POST   /proposte/anteprima               anteprima proposta + mail
POST   /proposte                         crea proposta {crm_deal_id, righe[{prodotto_id, quantita, sconto_pct}], scadenza, modalita_pagamento, num_rate, invia}
GET    /proposte?crm_deal_id=&crm_person_id=
GET    /proposte/{id}                    stato, aperture, promemoria, pagamento, lms, fattura
POST   /proposte/{id}/invia | /reinvia | /lms
PATCH  /proposte/{id}/promemoria         {promemoria_id, data_ora}
POST   /proposte/{id}/proroga            {scadenza}
GET    /proposte/{id}/fattura`}</Code>
      </Card>
      <Card title="Webhook eventi dal gestionale contratti" testid="webhook-contratti-card">
        <Field label="URL" value={`${BASE}/api/webhooks/contratti`} testid="webhook-contratti-url" />
        <Field label="Header X-Webhook-Secret" value={cfg.webhook_secret} testid="webhook-contratti-secret" />
        <p className="text-xs text-slate-500">Eventi che cambiano fase: proposta_inviata, remind_inviato, aggiudicato, perso. Eventi in cronologia: proposta_creata, proposta_aperta, promemoria_modificato, proposta_prorogata, mail_reinviata, pagamento_ricevuto, rata_pagata, lms_creato, lms_reinviato, fattura_emessa.</p>
        <Code>{`POST ${BASE}/api/webhooks/contratti
X-Webhook-Secret: ${cfg.webhook_secret}
{"event": "proposta_inviata", "crm_deal_id": "...", "proposta_id": "PR-2026-0001", "valore": 450, "email": "cliente@email.it"}`}</Code>
      </Card>
      <Card title="Ingresso lead (Facebook e sito)" testid="webhook-leads-card">
        <Field label="URL" value={`${BASE}/api/webhooks/leads`} testid="webhook-leads-url" />
        <Field label="Header X-Leads-Secret" value={cfg.leads_secret} testid="webhook-leads-secret" />
        <p className="text-xs text-slate-500">Utilizzabile da Zapier/Make o dal modulo del sito. I lead entrano in “Da assegnare”; se email o telefono esistono già, il lead viene unito al contatto esistente.</p>
        <Code>{`{"nome": "Mario", "cognome": "Rossi", "email": "mario@email.it", "telefono": "3331234567", "prodotto_richiesto": "Corso Carbon Farming", "tipo_marketing": "Facebook", "citta": "Roma", "privacy": "Sì"}`}</Code>
      </Card>
    </div>
  );
}
