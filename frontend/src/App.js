import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Show, SignIn, SignUp, UserButton } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import { AppProvider } from "@/context/AppContext";
import Layout from "@/components/Layout";
import ContactsPage from "@/pages/ContactsPage";
import PersonDetail from "@/pages/PersonDetail";
import OrgDetail from "@/pages/OrgDetail";
import DealsPage from "@/pages/DealsPage";
import DealDetail from "@/pages/DealDetail";
import ActivitiesPage from "@/pages/ActivitiesPage";
import ImportPage from "@/pages/ImportPage";
import UsersPage from "@/pages/UsersPage";
import IntegrationsPage from "@/pages/IntegrationsPage";

const Brand = () => (
  <div className="hidden w-[42%] flex-col justify-between bg-[#071c38] p-12 text-white lg:flex">
    <div className="font-display text-2xl font-bold tracking-tight">ITALIA<span className="text-[#C9A227]">CORSI</span></div>
    <div>
      <h1 className="font-display text-4xl font-semibold leading-tight">Gestionale<br />commerciale</h1>
      <p className="mt-4 max-w-sm text-sm text-slate-300">Contatti, affari e attività del team commerciale in un unico posto.</p>
    </div>
    <div className="h-1 w-16 bg-[#C9A227]" />
  </div>
);

const AuthPage = ({ mode }) => (
  <div className="flex min-h-screen bg-white">
    <Brand />
    <div className="flex flex-1 items-center justify-center p-6">
      {mode === "in"
        ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp />
        : <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />}
    </div>
  </div>
);

const Waiting = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#f4f6f9] p-6" data-testid="waiting-approval">
    <div className="crm-card max-w-md p-8 text-center">
      <div className="mb-4 flex justify-end"><UserButton /></div>
      <h1 className="font-display text-2xl font-semibold text-[#0a3b7c]">Account in attesa</h1>
      <p className="mt-3 text-sm text-slate-600">Il tuo account è stato creato. Angelo (amministratore) deve abilitarti come commerciale prima che tu possa accedere ai contatti.</p>
    </div>
  </div>
);

const Shell = () => (
  <AppProvider waiting={<Waiting />}>
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/contatti" replace />} />
        <Route path="/contatti" element={<ContactsPage view="persons" />} />
        <Route path="/contatti/organizzazioni" element={<ContactsPage view="organizations" />} />
        <Route path="/contatti/da-assegnare" element={<ContactsPage view="da_assegnare" />} />
        <Route path="/persone/:id" element={<PersonDetail />} />
        <Route path="/organizzazioni/:id" element={<OrgDetail />} />
        <Route path="/affari" element={<DealsPage />} />
        <Route path="/affari/:id" element={<DealDetail />} />
        <Route path="/attivita" element={<ActivitiesPage />} />
        <Route path="/importa" element={<ImportPage />} />
        <Route path="/utenti" element={<UsersPage />} />
        <Route path="/integrazioni" element={<IntegrationsPage />} />
        <Route path="*" element={<Navigate to="/contatti" replace />} />
      </Routes>
    </Layout>
  </AppProvider>
);

function App() {
  return (
    <BrowserRouter>
      <ClerkAuthProvider>
        <Routes>
          <Route path="/sign-in/*" element={<AuthPage mode="in" />} />
          <Route path="/sign-up/*" element={<AuthPage mode="up" />} />
          <Route path="/*" element={<>
            <Show when="signed-in"><Shell /></Show>
            <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
          </>} />
        </Routes>
        <Toaster position="top-center" richColors />
      </ClerkAuthProvider>
    </BrowserRouter>
  );
}

export default App;
