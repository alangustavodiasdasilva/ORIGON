import { Outlet, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    ShieldCheck,
    LogOut,
    Microscope,
    Network,
    CheckCircle2,
    AlertCircle,
    Info,
    Award,
    Package,
    Download,
    Upload,
    Zap,
    Menu,
    X,
    FileSpreadsheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnalistaService, type Analista } from "@/entities/Analista";
import ChatAssistant from "./ChatAssistant";
import ParticleBackground from "./ParticleBackground";
import NotificationCenter from "@/components/NotificationCenter";
import GlobalSearch from "@/components/GlobalSearch";
import { BackupService } from "@/services/BackupService";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function Layout() {
    const location = useLocation();
    const { user, logout } = useAuth();
    const { toasts } = useToast();
    const { t, language, setLanguage } = useLanguage();
    const [onlineUsers, setOnlineUsers] = useState<Analista[]>([]);

    // Enable global keyboard shortcuts
    useKeyboardShortcuts();

    // Verificação de acesso para a navegação
    const isAdmin = user?.acesso === 'admin_global';

    useEffect(() => {
        // Heartbeat to keep user online and track context
        if (user?.id) {
            const updatePresence = () => {
                const searchParams = new URLSearchParams(location.search);
                const loteId = searchParams.get('loteId');
                AnalistaService.updateLastActive(user.id, loteId || null);
            };

            const heartbeat = setInterval(updatePresence, 2000);

            // Initial call
            updatePresence();

            return () => clearInterval(heartbeat);
        }
    }, [user?.id, location.search]);

    useEffect(() => {
        const loadOnline = async () => {
            try {
                const list = await AnalistaService.list();
                const now = new Date().getTime();
                const others = list.filter(a => {
                    const isActive = a.last_active && (now - new Date(a.last_active).getTime() < 12000);
                    return a.id !== user?.id &&
                        a.email !== "admin@fibertech.com" &&
                        isActive;
                });
                setOnlineUsers(others);
            } catch (error) {
                console.error("Erro ao carregar usuários online:", error);
            }
        };

        loadOnline();
        const interval = setInterval(loadOnline, 2000);
        return () => clearInterval(interval);
    }, [user?.id]);

    const navItems = [
        { href: "/", label: t('nav.home'), icon: LayoutDashboard, public: true },
        { href: "/lotes", label: t('nav.batches'), icon: Package, public: true },
        { href: "/icac", label: t('nav.icac'), icon: Microscope, public: true },
        { href: "/interlaboratorial", label: t('nav.interlab'), icon: Network, public: true },
        { href: "/operacao", label: "Operação", icon: Zap, allowedRoles: ['admin_global', 'admin_lab', 'quality_admin'] },
        { href: "/monitoramento-os", label: "Monitoramento O.S.", icon: FileSpreadsheet, allowedRoles: ['admin_global', 'admin_lab', 'quality_admin'] },
        { href: "/quality", label: t('nav.quality'), icon: Award, allowedRoles: ['admin_global', 'admin_lab', 'quality_admin'] },
        { href: "/admin", label: t('nav.config'), icon: ShieldCheck, allowedRoles: ['admin_global', 'admin_lab'] },
    ];

    const getInitials = (name: string) => {
        if (!name) return "??";
        return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    };

    const latestToast = toasts[toasts.length - 1];

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
            <ParticleBackground />

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
                    <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-neutral-200 shadow-2xl flex flex-col animate-slide-right">
                        <div className="p-8 border-b border-neutral-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="50" cy="50" r="48" stroke="#dc2626" strokeWidth="6" />
                                    <circle cx="50" cy="50" r="10" fill="#dc2626" />
                                </svg>
                                <h1 className="text-xl font-serif tracking-[0.1em] text-black">ORIGO</h1>
                            </div>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full" title="Fechar Menu">
                                <X className="h-5 w-5 text-neutral-500" />
                            </button>
                        </div>

                        <nav className="flex-1 overflow-y-auto py-4">
                            {navItems.map((item) => {
                                const isAllowed = item.public || (user?.acesso && item.allowedRoles?.includes(user.acesso));
                                if (!isAllowed) return null;

                                const isActive = location.pathname === item.href || (item.href !== "/" && location.pathname.startsWith(item.href));
                                const Icon = item.icon;

                                return (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={cn(
                                            "flex items-center gap-4 px-8 py-4 text-xs font-bold uppercase tracking-widest transition-colors border-l-4",
                                            isActive
                                                ? "border-black bg-neutral-50 text-black"
                                                : "border-transparent text-neutral-500 hover:text-black hover:bg-neutral-50"
                                        )}
                                    >
                                        <Icon className={cn("h-4 w-4", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="p-8 border-t border-neutral-100 bg-neutral-50">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 bg-white border border-neutral-200 flex items-center justify-center text-xs font-bold uppercase overflow-hidden">
                                    {user?.foto ? (
                                        <img src={user.foto} className="w-full h-full object-cover" alt="User" />
                                    ) : (
                                        getInitials(user?.nome || "")
                                    )}
                                </div>
                                <div>
                                    <div className="text-xs font-bold uppercase text-black">{user?.nome || "Guest"}</div>
                                    <div className="text-[10px] text-neutral-400 font-mono uppercase">{user?.cargo || "Viewer"}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                                className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-neutral-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors text-[10px] font-bold uppercase tracking-widest text-neutral-500"
                            >
                                <LogOut className="h-3 w-3" /> {t('common.logout')}
                            </button>
                        </div>
                    </aside>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className="fixed inset-y-0 left-0 z-50 w-72 border-r border-black bg-white/80 backdrop-blur-md hidden lg:flex flex-col">
                <div className="p-10 pb-12">
                    <div className="flex items-center gap-4">
                        {/* ORIGO Small Logo */}
                        <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="50" cy="50" r="48" stroke="#dc2626" strokeWidth="4" />
                            <circle cx="50" cy="50" r="8" fill="#dc2626" />
                        </svg>
                        <h1 className="text-2xl font-serif tracking-[0.1em] text-neutral-900">ORIGO</h1>
                    </div>
                </div>

                <nav className="flex-1 px-0 space-y-0">
                    <div className="px-10 mb-6">
                        <div className="text-[10px] uppercase font-bold tracking-[0.25em] text-neutral-400">{t('common.navigation')}</div>
                    </div>

                    {navItems.map((item) => {
                        const isAllowed = item.public || (user?.acesso && item.allowedRoles?.includes(user.acesso));
                        if (!isAllowed) return null;

                        const isActive = location.pathname === item.href || (item.href !== "/" && location.pathname.startsWith(item.href));
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    "group flex items-center justify-between px-10 py-5 text-xs font-bold uppercase tracking-widest transition-all duration-300 border-l-4",
                                    isActive
                                        ? "border-black bg-neutral-50 text-black"
                                        : "border-transparent text-neutral-500 hover:text-black hover:bg-neutral-50 hover:border-neutral-200"
                                )}
                            >
                                <div className="flex items-center gap-4">
                                    <Icon className={cn("h-4 w-4", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
                                    <span>{item.label}</span>
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-10 border-t border-black min-h-[160px] flex flex-col justify-end">
                    {latestToast ? (
                        <div className={cn(
                            "flex flex-col gap-2 p-4 border animate-slide-up bg-white",
                            latestToast.type === "success" && "border-black bg-neutral-50",
                            latestToast.type === "error" && "border-red-500 bg-red-50",
                            latestToast.type === "info" && "border-blue-500 bg-blue-50"
                        )}>
                            <div className="flex items-center gap-3">
                                {latestToast.type === "success" && <CheckCircle2 className="h-4 w-4 text-black" />}
                                {latestToast.type === "error" && <AlertCircle className="h-4 w-4 text-red-600" />}
                                {latestToast.type === "info" && <Info className="h-4 w-4 text-blue-600" />}
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-widest",
                                    latestToast.type === "error" ? "text-red-700" : "text-black"
                                )}>
                                    {latestToast.title}
                                </span>
                            </div>
                            {latestToast.description && (
                                <p className="text-[10px] text-neutral-600 font-mono leading-relaxed">
                                    {latestToast.description}
                                </p>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-10 h-10 border border-neutral-200 flex items-center justify-center text-xs font-bold bg-neutral-50 overflow-hidden">
                                    {user?.foto ? (
                                        <img src={user.foto} className="w-full h-full object-cover" alt="User" />
                                    ) : (
                                        getInitials(user?.nome || "")
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold uppercase tracking-wider text-black">
                                        {user?.nome || "Analyst"}
                                    </span>
                                    <span className="text-[10px] text-neutral-400 font-mono">
                                        {user?.cargo || "Viewer"}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 hover:text-black transition-colors"
                            >
                                <LogOut className="h-3 w-3" /> {t('common.logout')}
                            </button>
                        </>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <div className="lg:ml-72 flex-1 flex flex-col min-h-screen relative z-10 transition-all duration-300">
                <header className="sticky top-0 z-40 h-16 lg:h-20 bg-white/80 backdrop-blur-sm border-b border-neutral-100 flex items-center justify-between px-4 lg:px-10">
                    <div className="flex items-center gap-4 lg:gap-8">
                        {/* Mobile Menu Trigger */}
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="lg:hidden p-2 -ml-2 hover:bg-neutral-100 rounded-md"
                            title="Abrir Menu"
                        >
                            <Menu className="h-5 w-5 text-black" />
                        </button>

                        <div className="hidden md:flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                            <span className="w-2 h-2 bg-black rounded-full"></span>
                            {t('status.system_status')}: {isAdmin ? t('status.admin') : t('status.operational')}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 lg:gap-4">
                        {/* Global Search - Hidden on tiny screens if needed, but keeping for now */}
                        <div className="hidden sm:block">
                            <GlobalSearch />
                        </div>

                        {/* Notification Center */}
                        <NotificationCenter />

                        {/* Admin Tools */}
                        {isAdmin && (
                            <div className="hidden md:flex items-center gap-2">
                                <button
                                    onClick={() => setLanguage(language === 'en' ? 'pt' : 'en')}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors"
                                    title={t('common.language')}
                                >
                                    <span className="w-4 h-3 flex items-center justify-center border border-neutral-300 rounded-[1px] text-[8px] leading-none">
                                        {language.toUpperCase()}
                                    </span>
                                </button>

                                <button
                                    onClick={() => BackupService.downloadBackup()}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors"
                                    title={t('common.backup')}
                                >
                                    <Download className="h-4 w-4" />
                                    <span className="hidden xl:inline">{t('common.backup')}</span>
                                </button>

                                <label className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                                    title={t('common.import')}
                                >
                                    <Upload className="h-4 w-4" />
                                    <span className="hidden xl:inline">{t('common.import')}</span>
                                    <input
                                        type="file"
                                        aria-label="Importar Backup"
                                        title="Importar Backup"
                                        accept=".json"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const result = await BackupService.importBackup(file);
                                                alert(result.message);
                                                if (result.success) {
                                                    window.location.reload();
                                                }
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                        )}

                        <div className="flex items-center gap-2 pl-4 border-l border-neutral-200">
                            <span className="h-2 w-2 bg-black animate-pulse rounded-full" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-black whitespace-nowrap">
                                <span className="hidden sm:inline">{onlineUsers.length + 1} {t('common.active_users')}</span>
                                <span className="sm:hidden">{onlineUsers.length + 1} ON</span>
                            </span>
                        </div>
                    </div>
                </header>

                <main className="flex-1 relative w-full overflow-x-hidden">
                    <div className="p-4 lg:p-10 max-w-[1600px] mx-auto w-full">
                        <Outlet />
                    </div>
                </main>
            </div>

            <ChatAssistant />
        </div>
    );
}
