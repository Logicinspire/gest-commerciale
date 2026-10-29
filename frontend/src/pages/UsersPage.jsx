import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const ROLE_LABEL = { admin: "Amministratore", commerciale: "Commerciale", in_attesa: "In attesa (nessun accesso)" };

const NameCell = ({ u, onSaved }) => {
  const [v, setV] = useState(u.name || "");
  const save = async () => { if (v === u.name) return; try { await api.patch(`/users/${u.user_id}/name`, { name: v }); toast.success("Nome aggiornato"); onSaved(); } catch (e) { toast.error(errMsg(e)); } };
  return <input className="crm-input h-8" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} data-testid={`user-name-${u.user_id}`} />;
};

export default function UsersPage() {
  const { isAdmin } = useApp();
  const [data, setData] = useState({ users: [], roles: [] });
  const load = () => api.get("/users").then((r) => setData(r.data));
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin) return <div className="p-10 text-sm text-slate-500">Accesso riservato all'amministratore.</div>;
  const setRole = async (u, role) => { try { await api.patch(`/users/${u.user_id}/role`, { role }); toast.success("Ruolo aggiornato"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="max-w-4xl p-6 fade-in" data-testid="users-page">
      <h1 className="font-display text-2xl font-semibold">Utenti</h1>
      <p className="mt-1 text-sm text-slate-600">Luca, Cristina e Carla si registrano da <b>{window.location.origin}/sign-up</b> con la loro email aziendale. Compaiono qui come “In attesa”: abilitali come Commerciale.</p>
      <div className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse" data-testid="users-table">
          <thead><tr><th className="th">Nome visualizzato</th><th className="th">Email</th><th className="th">Ruolo</th></tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.user_id} data-testid={`user-row-${u.user_id}`}>
              <td className="td"><NameCell u={u} onSaved={load} /></td>
              <td className="td">{u.email}</td>
              <td className="td"><select className="crm-select h-8" value={u.role} onChange={(e) => setRole(u, e.target.value)} data-testid={`user-role-${u.user_id}`}>
                {data.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
              </select></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
