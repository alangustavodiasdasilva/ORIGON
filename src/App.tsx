import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import Layout from "@/components/shared/Layout";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { ToastProvider } from "@/contexts/ToastContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LabProvider } from "@/contexts/LabContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { realtimeService } from "@/services/RealtimeService";
import { systemStatusService } from "@/services/systemStatus.service";

// Lazy imports — cada página só é carregada quando o usuário navegar até ela
const Inicio = lazy(() => import("@/pages/Inicio"));
const Home = lazy(() => import("@/pages/Home"));
const Registro = lazy(() => import("@/pages/Registro"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Export = lazy(() => import("@/pages/Export"));
const Admin = lazy(() => import("@/pages/Admin"));
const Login = lazy(() => import("@/pages/Login"));
const Reanalise = lazy(() => import("@/pages/Reanalise"));
const Verificacao = lazy(() => import("@/pages/Verificacao"));


// Tela de bloqueio mostrada pra todo mundo que NÃO é admin_global enquanto o
// modo de manutenção está ativo — o admin_global continua usando o sistema
// normalmente (é ele quem ativa/desativa).
function MaintenanceScreen({ updatedBy }: { updatedBy: string | null }) {
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-black text-white gap-6 px-6 text-center">
            <Lock className="w-14 h-14 text-white/60" />
            <div className="space-y-2">
                <h1 className="text-2xl font-bold uppercase tracking-widest">Sistema em Manutenção</h1>
                <p className="text-sm text-white/60 max-w-md">
                    O sistema está temporariamente indisponível para atualizações.
                    {updatedBy ? ` Aguarde a liberação por ${updatedBy}.` : " Aguarde a liberação."}
                </p>
            </div>
        </div>
    );
}

function AppRoutes() {
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [maintenanceBy, setMaintenanceBy] = useState<string | null>(null);

    // Injeta realtime presence
    useEffect(() => {
        if (isAuthenticated && user?.id) {
            try {
                realtimeService.init(user.id, user.nome, user.foto);
            } catch (err) {
                console.error("Falha ao inicializar o RealtimeService:", err);
            }
        }
    }, [isAuthenticated, user?.id, user?.nome, user?.foto]);

    // Modo de manutenção: só é checado depois de autenticado (não trava a tela de login).
    useEffect(() => {
        if (!isAuthenticated) return;
        systemStatusService.get().then(s => {
            setMaintenanceMode(s.maintenanceMode);
            setMaintenanceBy(s.updatedBy);
        }).catch(console.error);
        const unsubscribe = systemStatusService.subscribe(s => {
            setMaintenanceMode(s.maintenanceMode);
            setMaintenanceBy(s.updatedBy);
        });
        return unsubscribe;
    }, [isAuthenticated]);

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

    if (maintenanceMode && user?.acesso !== 'admin_global') {
        return <MaintenanceScreen updatedBy={maintenanceBy} />;
    }

    return (
        <Suspense fallback={<LoadingScreen />}>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Inicio />} />
                    <Route path="lotes" element={<Home />} />
                    <Route path="registro" element={<Registro />} />

                    <Route path="analysis" element={<Analysis />} />

                    <Route path="export" element={<Export />} />
                    <Route path="reanalise" element={<Reanalise />} />
                    <Route path="verificacao" element={<Verificacao />} />
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
