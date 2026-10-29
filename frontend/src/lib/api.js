import axios from "axios";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

let tokenGetter = null;
export const setTokenGetter = (fn) => { tokenGetter = fn; };

api.interceptors.request.use(async (cfg) => {
  if (tokenGetter) {
    const t = await tokenGetter();
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : d?.message || "Errore imprevisto";
};
