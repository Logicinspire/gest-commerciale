import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { api, setTokenGetter } from "@/lib/api";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const AppProvider = ({ children, waiting }) => {
  const { getToken } = useAuth();
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [config, setConfig] = useState({});
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(false);

  setTokenGetter(getToken);

  const loadProducts = useCallback(() => api.get("/products").then((r) => setProducts(r.data.items)), []);

  useEffect(() => {
    api.get("/me").then(async (r) => {
      setMe(r.data);
      if (r.data.role === "in_attesa") return;
      const [t, c] = await Promise.all([api.get("/team"), api.get("/config")]);
      setTeam(t.data); setConfig(c.data);
      loadProducts();
    }).catch(() => setError(true));
  }, [loadProducts]);

  const userName = (id) => team.find((u) => u.user_id === id)?.name;

  if (error) return <div className="p-10 text-sm text-slate-600">Impossibile caricare il profilo. Ricarica la pagina.</div>;
  if (!me) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">Caricamento…</div>;
  if (me.role === "in_attesa") return waiting;
  return (
    <Ctx.Provider value={{ me, team, config, products, loadProducts, userName, isAdmin: me.role === "admin" }}>
      {children}
    </Ctx.Provider>
  );
};
