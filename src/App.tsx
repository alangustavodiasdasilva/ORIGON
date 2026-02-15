import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/shared/Layout";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { ToastProvider } from "@/contexts/ToastContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

// Regular imports instead of lazy for stability
import Inicio from "@/pages/Inicio";
import Home from "@/pages/Home";
import Registro from "@/pages/Registro";
import Analysis from "@/pages/Analysis";
import Icac from "@/pages/Icac";
import Interlaboratorial from "@/pages/Interlaboratorial";
import Export from "@/pages/Export";
import Operacao from "@/pages/Operacao";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Quality from "@/pages/Quality";
import MonitoramentoOS from "@/pages/MonitoramentoOS";

function AppRoutes() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();


  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="lotes" element={<Home />} />
        <Route path="registro" element={<Registro />} />
        <Route path="analysis" element={<Analysis />} />
        <Route path="icac" element={<Icac />} />
        <Route path="interlaboratorial" element={<Interlaboratorial />} />
        <Route path="export" element={<Export />} />
        <Route path="quality" element={<Quality />} />
        <Route path="operacao" element={<Operacao />} />
        <Route path="monitoramento-os" element={<MonitoramentoOS />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
