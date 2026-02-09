import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, Package, Shield, Building2, Activity, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { LabService, type Lab } from "@/entities/Lab";
import { Button } from "@/components/ui/button";

export default function Inicio() {
    const { user, currentLab, selectLab, deselectLab } = useAuth();
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isLoadingLabs, setIsLoadingLabs] = useState(false);

    useEffect(() => {
        if (user?.acesso === 'admin_global' && !currentLab) {
            setIsLoadingLabs(true);
            LabService.list()
                .then(setLabs)
                .catch(console.error)
                .finally(() => setIsLoadingLabs(false));
        }
    }, [user, currentLab]);

    // System Selection Screen for Global Admin
    if (user?.acesso === 'admin_global' && !currentLab) {
        return (
            <div className="min-h-full flex flex-col items-center justify-center p-8 space-y-12">
                <div className="text-center space-y-6 max-w-2xl">
                    <div className="inline-flex items-center justify-center p-4 bg-black rounded-2xl mb-6 shadow-2xl">
                        <Building2 className="h-12 w-12 text-white" />
                    </div>
                    <h1 className="text-5xl lg:text-6xl font-serif text-black leading-tight">
                        Selecione o Laboratório
                    </h1>
                    <p className="text-xl text-neutral-600 font-light">
                        Você está no modo Administrador Global. Escolha um laboratório para acessar e gerenciar suas configurações e dados.
                    </p>
                </div>

                {isLoadingLabs ? (
                    <div className="animate-pulse flex gap-4">
                        <div className="h-48 w-64 bg-neutral-200 rounded-2xl"></div>
                        <div className="h-48 w-64 bg-neutral-200 rounded-2xl"></div>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                        {labs.map((lab) => (
                            <button
                                key={lab.id}
                                onClick={() => selectLab(lab.id)}
                                className="group relative flex flex-col p-8 bg-white border-2 border-neutral-200 hover:border-black rounded-2xl transition-all duration-300 text-left hover:shadow-xl hover:-translate-y-1"
                            >
                                <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ArrowRight className="h-6 w-6 text-black" />
                                </div>
                                <div className="h-12 w-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-black group-hover:text-white transition-colors">
                                    <Activity className="h-6 w-6" />
                                </div>
                                <h3 className="text-2xl font-serif text-black mb-2">{lab.nome}</h3>
                                <p className="text-sm font-mono text-neutral-500 uppercase tracking-wider mb-4">
                                    {lab.cidade || 'N/A'} - {lab.estado || 'N/A'}
                                </p>
                                <div className="mt-auto pt-6 border-t border-neutral-100 w-full flex justify-between items-center">
                                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 group-hover:text-black">
                                        Acessar Painel
                                    </span>
                                    <span className="text-xs font-mono text-neutral-300 group-hover:text-black">
                                        ID: {lab.codigo}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {labs.length === 0 && !isLoadingLabs && (
                    <div className="text-center p-8 border-2 border-dashed border-neutral-300 rounded-2xl">
                        <p className="text-neutral-500 font-mono">Nenhum laboratório encontrado.</p>
                        <Button variant="outline" className="mt-4">Criar Novo Laboratório</Button>
                    </div>
                )}
            </div>
        );
    }

    const quickActions = [
        {
            title: "Gerenciar Lotes",
            description: "Crie, edite e organize seus lotes de fibra",
            href: "/lotes",
            icon: Package,
            gradient: "from-blue-500/10 to-purple-500/10",
            iconColor: "text-blue-600"
        },
        {
            title: "Gestão de Qualidade",
            description: "Auditorias e certificações",
            href: "/quality",
            icon: Shield,
            gradient: "from-orange-500/10 to-red-500/10",
            iconColor: "text-orange-600"
        }
    ];

    return (
        <div className="min-h-full relative z-10">
            {/* Hero Section */}
            <div className="max-w-7xl mx-auto px-8 py-16">
                <div className="space-y-12">
                    {/* Header */}
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 font-mono bg-neutral-100 px-4 py-2 rounded-full">
                                Sistema de Análise HVI
                            </span>
                            {currentLab && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-[0.2em] text-white font-mono bg-black px-4 py-2 rounded-full flex items-center gap-2">
                                        <Building2 className="h-3 w-3" />
                                        {currentLab.nome}
                                    </span>
                                    {user?.acesso === 'admin_global' && (
                                        <button
                                            onClick={() => deselectLab()}
                                            className="h-8 w-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors text-black"
                                            title="Trocar Laboratório"
                                        >
                                            <LogOut className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <h1 className="text-6xl lg:text-7xl font-serif text-black leading-[1.1] tracking-tight">
                            Olá, <span className="italic">{user?.nome?.split(' ')[0] || 'Analista'}</span>
                        </h1>
                        <p className="text-xl text-neutral-600 max-w-2xl font-light">
                            Bem-vindo ao ORIGO. Comece selecionando uma ação abaixo ou navegue pelo menu para acessar todas as funcionalidades.
                        </p>
                    </div>

                    {/* Quick Actions Grid */}
                    <div className="grid gap-8 md:grid-cols-2 pt-8">
                        {quickActions.map((action, index) => {
                            const Icon = action.icon;
                            return (
                                <Link
                                    key={index}
                                    to={action.href}
                                    className="group relative overflow-hidden bg-white border-2 border-neutral-200 hover:border-black transition-all duration-500 rounded-2xl p-10"
                                >
                                    {/* Gradient Background */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                                    {/* Content */}
                                    <div className="relative z-10 space-y-6">
                                        <div className="flex items-start justify-between">
                                            <div className={`p-4 rounded-xl bg-white border border-neutral-200 ${action.iconColor}`}>
                                                <Icon className="h-8 w-8" />
                                            </div>
                                            <ArrowRight className="h-6 w-6 text-neutral-400 group-hover:text-black group-hover:translate-x-1 transition-all duration-300" />
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-2xl font-serif text-black group-hover:translate-x-1 transition-transform duration-300">
                                                {action.title}
                                            </h3>
                                            <p className="text-neutral-600 font-mono text-sm leading-relaxed">
                                                {action.description}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Hover Border Animation */}
                                    <div className="absolute inset-0 border-2 border-black opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity duration-300" />
                                </Link>
                            );
                        })}
                    </div>

                    {/* System Info */}
                    <div className="grid md:grid-cols-3 gap-6 pt-12 border-t border-neutral-200">
                        <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-mono">Status do Sistema</p>
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                                <p className="text-sm font-mono text-black">Operacional</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-mono">Última Atualização</p>
                            <p className="text-sm font-mono text-black">
                                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-mono">Versão</p>
                            <p className="text-sm font-mono text-black">ORIGO v2.0</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
