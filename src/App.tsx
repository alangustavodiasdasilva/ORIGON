import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import Layout from "@/components/shared/Layout";
import LoadingScreen from "@/components/shared/LoadingScreen";
import ParticleBackground from "@/components/shared/ParticleBackground";
import { ToastProvider } from "@/contexts/ToastContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LabProvider } from "@/contexts/LabContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { realtimeService } from "@/services/RealtimeService";
import { systemStatusService } from "@/services/systemStatus.service";
import { AnalistaService } from "@/entities/Analista";

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


// Tela mostrada no lugar do sistema pra quem está bloqueado (manutenção global
// ou o laboratório dele travado). Disfarçada de erro genérico de propósito —
// mesmo visual da tela de login (bolinhas + logo), sem palavra nenhuma que
// entregue que foi um bloqueio administrativo intencional.
function BlockedScreen() {
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white text-neutral-900 relative overflow-hidden px-6 text-center">
            <ParticleBackground />
            <div className="relative z-10 flex flex-col items-center gap-6">
                <svg width="64" height="64" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="48" stroke="#dc2626" strokeWidth="2" />
                    <circle cx="50" cy="50" r="8" fill="#dc2626" />
                </svg>
                <div className="space-y-2">
                    <h1 className="text-xl font-serif tracking-wide text-neutral-800">Ocorreu um erro inesperado</h1>
                    <p className="text-xs text-neutral-400 max-w-sm uppercase tracking-widest">
                        Não foi possível carregar o sistema no momento. Tente novamente mais tarde.
                    </p>
                </div>
            </div>
        </div>
    );
}

// Trava de segurança: além de checar o "acesso" (que depende de dados carregados
// via rede/localStorage e já causou um bloqueio indevido uma vez), o dono da conta
// nunca pode ficar preso atrás do próprio bloqueio — checagem que não depende de
// nenhuma consulta, só do que já veio no login.
const NUNCA_BLOQUEAR_EMAILS = ["alangds03@gmail.com"];

function AppRoutes() {
    const { user, currentLab, isAuthenticated, isLoading: authLoading } = useAuth();
    const location = useLocation();
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [lockedLabIds, setLockedLabIds] = useState<string[]>([]);
    // Confirmação fresca (direto do banco) do acesso do usuário, só buscada quando
    // algum bloqueio está ativo — evita travar um admin_global por causa de um
    // "acesso" desatualizado que ficou salvo no localStorage da sessão.
    const [confirmedAcesso, setConfirmedAcesso] = useState<string | null>(null);

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

    // Bloqueios: só checados depois de autenticado (não trava a tela de login).
    useEffect(() => {
        if (!isAuthenticated) return;

        systemStatusService.get().then(s => setMaintenanceMode(s.maintenanceMode)).catch(console.error);
        const unsubGlobal = systemStatusService.subscribe(s => setMaintenanceMode(s.maintenanceMode));

        systemStatusService.getLockedLabs().then(labs => setLockedLabIds(labs.map(l => l.labId))).catch(console.error);
        const unsubLabs = systemStatusService.subscribeLabLockdown(labs => setLockedLabIds(labs.map(l => l.labId)));

        return () => {
            unsubGlobal();
            unsubLabs();
        };
    }, [isAuthenticated]);

    const homeLabId = currentLab?.id || user?.lab_id || null;
    const isLabBlocked = !!homeLabId && lockedLabIds.includes(homeLabId);
    const anyBlockActive = maintenanceMode || isLabBlocked;

    // Assim que algum bloqueio liga, confirma o "acesso" direto no banco antes de
    // decidir bloquear — se o localStorage estiver com um valor desatualizado,
    // isso evita trancar um admin_global fora do próprio painel de manutenção.
    useEffect(() => {
        if (!anyBlockActive || !user?.id) {
            setConfirmedAcesso(null);
            return;
        }
        AnalistaService.get(user.id)
            .then(a => setConfirmedAcesso(a?.acesso ?? user.acesso ?? null))
            .catch(() => setConfirmedAcesso(user.acesso ?? null));
    }, [anyBlockActive, user?.id]);

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

    const isNeverBlocked = !!user?.email && NUNCA_BLOQUEAR_EMAILS.includes(user.email.toLowerCase());
    // A rota /admin NUNCA é bloqueada — é lá que fica o painel de travamento. Bloqueá-la
    // também trancaria o próprio dono fora do interruptor. Quem não tem permissão de
    // admin é redirecionado pra "/" pelo Admin.tsx, e aí sim cai no bloqueio normalmente.
    const isAdminRoute = location.pathname === '/admin' || location.pathname.endsWith('/admin');

    if (anyBlockActive && !isNeverBlocked && !isAdminRoute) {
        // Enquanto a confirmação ainda não voltou, usa o valor já conhecido da sessão
        // como palpite (evita reter a tela por causa da latência da consulta).
        const effectiveAcesso = confirmedAcesso ?? user?.acesso;
        if (effectiveAcesso !== 'admin_global') {
            return <BlockedScreen />;
        }
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
