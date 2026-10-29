import { useState } from "react";
import Papa from "papaparse";
import { Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const KINDS = {
  organizations: { label: "1 · Organizzazioni", fields: {
    pipedrive_id: [/^(organizzazione - )?id$/], nome: [/^(organizzazione - )?nome$/, /name$/], indirizzo: [/indirizzo$/, /address$/], citta: [/citt/, /locality/],
    telefono: [/telefono/, /phone/], email: [/email/], owner: [/proprietario/, /owner/], created_at: [/creat/, /aggiunt/] } },
  persons: { label: "2 · Persone", fields: {
    pipedrive_id: [/^(persona - )?id$/, /^(person - )?id$/], full_name: [/^(persona - )?nome$/, /^(person - )?name$/], nome: [/nome di battesimo/, /first name/],
    cognome: [/cognome/, /last name/], email: [/email/], telefono: [/telefono/, /phone/], professione: [/professione/], primo_contatto: [/primo contatto/],
    prodotto_richiesto: [/prodotto/], tipo_marketing: [/tipo marketing/], citta: [/citt/], privacy: [/privacy/], etichette: [/etichett/, /label/],
    organizzazione: [/^(persona - )?organizzazione$/, /organization$/], org_pipedrive_id: [/^organizzazione - id$/, /organization - id$/],
    owner: [/proprietario/, /owner/], created_at: [/persona creata/, /creat/], updated_at: [/aggiornamento/, /update/] } },
  deals: { label: "3 · Affari", fields: {
    pipedrive_id: [/^(affare - )?id$/, /^(deal - )?id$/], titolo: [/titolo/, /title/], valore: [/^(affare - )?valore$/, /value$/],
    persona: [/persona di contatto$/, /^persona - nome$/, /contact person$/], person_pipedrive_id: [/^persona - id$/, /persona di contatto - id/, /person - id/],
    email: [/persona.*email/, /email/], organizzazione: [/^(affare - )?organizzazione$/, /organization$/], org_pipedrive_id: [/^organizzazione - id$/],
    owner: [/proprietario/, /owner/], fase: [/fase/, /stage/], stato: [/^(affare - )?stato$/, /status/], etichetta: [/etichett/, /label/],
    created_at: [/affare creato/, /creat/], closed_at: [/data di aggiud/, /chius/, /won time/] } },
  activities: { label: "4 · Attività", fields: {
    pipedrive_id: [/^(attività - )?id$/, /^(activity - )?id$/], tipo: [/^(attività - )?tipo$/, /type$/], oggetto: [/oggetto/, /subject/],
    data: [/data di scadenza/, /scadenza/, /due date/], ora: [/ora di scadenza/, /due time/], done: [/completat/, /done/], note: [/^(attività - )?nota$/, /note/],
    persona: [/persona di contatto$/, /contact person$/], person_pipedrive_id: [/persona.* - id$/], email: [/email/], affare: [/^affare$/, /affare - titolo/, /deal$/],
    deal_pipedrive_id: [/affare - id/, /deal - id/], owner: [/assegnat/, /proprietario/, /owner/], created_at: [/aggiunt/, /creat/], done_at: [/data di completamento/, /marked as done/] } },
  notes: { label: "5 · Note", fields: {
    pipedrive_id: [/^(nota - )?id$/], content: [/contenuto/, /content/, /^nota$/], persona: [/^persona$/, /persona - nome/, /person$/],
    person_pipedrive_id: [/persona - id/, /person - id/], affare: [/^affare$/, /affare - titolo/, /deal$/], deal_pipedrive_id: [/affare - id/, /deal - id/],
    owner: [/utente/, /autore/, /user/], created_at: [/aggiunt/, /creat/, /^data$/] } },
};

const guess = (headers, patterns) => headers.find((h) => patterns.some((p) => p.test(h.toLowerCase().trim()))) || "";
const CHUNK = 200;

export default function ImportPage() {
  const { isAdmin } = useApp();
  const [kind, setKind] = useState("organizations");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  if (!isAdmin) return <div className="p-10 text-sm text-slate-500">Solo l'amministratore può importare.</div>;
  const fields = KINDS[kind].fields;

  const onFile = (file) => {
    setResult(null);
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (res) => {
      const h = res.meta.fields || [];
      setHeaders(h); setRows(res.data);
      setMap(Object.fromEntries(Object.entries(fields).map(([f, pats]) => [f, guess(h, pats)])));
      toast.success(`${res.data.length} righe lette`);
    } });
  };
  const changeKind = (k) => { setKind(k); setRows([]); setHeaders([]); setMap({}); setResult(null); setProgress(null); };
  const run = async () => {
    const mapped = rows.map((r) => Object.fromEntries(Object.entries(map).filter(([, h]) => h).map(([f, h]) => [f, r[h]])));
    const tot = { creati: 0, aggiornati: 0, saltati: 0 };
    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        setProgress(Math.round((i / mapped.length) * 100));
        const r = await api.post(`/import/${kind}`, { rows: mapped.slice(i, i + CHUNK) });
        Object.keys(tot).forEach((k) => { tot[k] += r.data[k]; });
      }
      setProgress(100); setResult(tot); toast.success("Importazione completata");
    } catch (e) { toast.error(errMsg(e)); setResult(tot); }
  };
  return (
    <div className="max-w-6xl p-6 fade-in" data-testid="import-page">
      <h1 className="font-display text-2xl font-semibold">Importa da Pipedrive</h1>
      <p className="mt-1 text-sm text-slate-600">Esporta da Pipedrive ogni elenco in CSV e importalo in questo ordine, così affari, attività e note si collegano alle persone giuste. I doppioni (stessa email o telefono, o stesso ID Pipedrive) vengono aggiornati, non duplicati.</p>
      <div className="mt-5 flex gap-2">
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} onClick={() => changeKind(k)} className={`rounded-md border px-3 py-2 text-sm font-medium ${kind === k ? "border-[#0a3b7c] bg-[#0a3b7c] text-white" : "border-slate-300 bg-white"}`} data-testid={`import-kind-${k}`}>{v.label}</button>
        ))}
      </div>
      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white p-8 hover:border-[#0a3b7c]" data-testid="import-dropzone">
        <Upload className="h-8 w-8 text-[#0a3b7c]" />
        <span className="mt-2 text-sm font-medium">Scegli il file CSV ({KINDS[kind].label.slice(4)})</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} data-testid="import-file-input" />
      </label>
      {headers.length > 0 && (
        <div className="mt-6 grid grid-cols-[360px_1fr] gap-6">
          <div className="crm-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Abbinamento colonne</h3>
            <div className="space-y-2">
              {Object.keys(fields).map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 text-xs text-slate-600">{f}</span>
                  <select className="crm-select h-8 flex-1 text-xs" value={map[f] || ""} onChange={(e) => setMap({ ...map, [f]: e.target.value })} data-testid={`import-map-${f}`}>
                    <option value="">— ignora —</option>{headers.map((h) => <option key={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="crm-card overflow-auto">
              <table className="w-full border-collapse text-xs" data-testid="import-preview">
                <thead><tr>{Object.keys(fields).filter((f) => map[f]).map((f) => <th key={f} className="th">{f}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{Object.keys(fields).filter((f) => map[f]).map((f) => <td key={f} className="td max-w-[180px] truncate">{r[map[f]]}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button className="btn-primary" onClick={run} disabled={progress !== null && progress < 100} data-testid="import-run-btn">Importa {rows.length} righe</button>
              {progress !== null && <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[#C9A227] transition-all" style={{ width: `${progress}%` }} /></div>}
            </div>
            {result && <div className="mt-3 flex items-center gap-2 text-sm text-green-700" data-testid="import-result"><CheckCircle2 className="h-4 w-4" />Creati {result.creati} · Aggiornati {result.aggiornati} · Saltati {result.saltati}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
