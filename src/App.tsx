import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import Layout from "@/components/shared/Layout";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { ToastProvider } from "@/contexts/ToastContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LabProvider } from "@/contexts/LabContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { producaoService } from "@/services/producao.service";
import { statusOSService } from "@/services/statusOS.service";
import { realtimeService } from "@/services/RealtimeService";

// Limpeza diária à meia noite das tabelas "Operacao" e "Monitoramento O.S."
function useDailyClear() {
    useEffect(() => {
        const checkAndClear = async () => {
            const today = new Date().toDateString();
            const lastCleared = localStorage.getItem('fibertech_last_daily_clear');

            if (lastCleared !== today) {
                try {
                    console.log('Executando limpeza diária de Operação e O.S. (virada do dia)...');
                    // 'all' vai limpar tudo na nuvem e no local
                    await Promise.all([
                        statusOSService.clearData('all'),
                        producaoService.deleteAll('all')
                    ]);
                    localStorage.setItem('fibertech_last_daily_clear', today);
                } catch (error) {
                    console.error('Erro na limpeza diária de meia-noite:', error);
                }
            }
        };

        checkAndClear();
        const interval = setInterval(checkAndClear, 60 * 1000); // Check every minute if midnight passed
        return () => clearInterval(interval);
    }, []);
}

// Lazy imports — cada página só é carregada quando o usuário navegar até ela
const Inicio = lazy(() => import("@/pages/Inicio"));
const Home = lazy(() => import("@/pages/Home"));
const Registro = lazy(() => import("@/pages/Registro"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Icac = lazy(() => import("@/pages/Icac"));
const Interlaboratorial = lazy(() => import("@/pages/Interlaboratorial"));
const Export = lazy(() => import("@/pages/Export"));
const Admin = lazy(() => import("@/pages/Admin"));
const Login = lazy(() => import("@/pages/Login"));

const Operacao = lazy(() => import("@/pages/Operacao"));
const MonitoramentoOS = lazy(() => import("@/pages/MonitoramentoOS"));
const Verificacao = lazy(() => import("@/pages/Verificacao"));


function AppRoutes() {
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    
    // Injeta realtime presence
    useEffect(() => {
        if (isAuthenticated && user?.id) {
            try {
                realtimeService.init(user.id, user.nome);
            } catch (err) {
                console.error("Falha ao inicializar o RealtimeService:", err);
            }
        }
    }, [isAuthenticated, user?.id, user?.nome]);

    // Executa o check de meia-noite se estiver logado
    useDailyClear();

    if (authLoading) {
        return <LoadingScreen />;
    }

    if (!isAuthenticated) {
        return (
            <Suspense fallback={<LoadingScreen />}>
                <Routes>
                    <Route path="*" element={<Login />} />
                </Routes>
            </Suspense>
        );
    }

    return (
        <Suspense fallback={<LoadingScreen />}>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Inicio />} />
                    <Route path="lotes" element={<Home />} />
                    <Route path="registro" element={<Registro />} />

                    <Route path="analysis" element={<Analysis />} />
                    <Route path="icac" element={<Icac />} />
                    <Route path="interlaboratorial" element={<Interlaboratorial />} />
                    <Route path="verificacao" element={<Verificacao />} />
                    <Route path="operacao" element={<Operacao />} />
                    <Route path="monitoramento-os" element={<MonitoramentoOS />} />
                    <Route path="export" element={<Export />} />
                    <Route path="admin" element={<Admin />} />
                </Route>
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <ThemeProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <AuthProvider>
                            <LabProvider>
                                <SyncProvider>
                                    <BrowserRouter basename={import.meta.env.BASE_URL}>
                                        <AppRoutes />
                                    </BrowserRouter>
                                </SyncProvider>
                            </LabProvider>
                        </AuthProvider>
                    </ToastProvider>
                </LanguageProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}
