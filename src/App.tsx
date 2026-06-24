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
import { realtimeService } from "@/services/RealtimeService";

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


function AppRoutes() {
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    
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
