import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { AnalistaService } from "@/entities/Analista";
import type { Analista } from "@/entities/Analista";
import { LabService, type Lab } from "@/entities/Lab";
import { safeSetItem as safeSetLocalStorage } from "@/lib/safeStorage";
import { labThrottleService } from "@/services/labThrottle.service";
import { enableNetworkThrottle, disableNetworkThrottle } from "@/lib/networkThrottle";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/passwordHash";

// Único admin_global de verdade — nunca sente a lentidão artificial que ele
// mesmo liga pra um laboratório, mesmo entrando nesse lab pra conferir.
const ALAN_USER_ID = "3222b299-4785-45f0-a76a-6ae6d6f17a4e";

interface AuthContextType {
    user: Analista | null;
    currentLab: Lab | null;
    login: (email: string, senha: string) => Promise<boolean>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    selectLab: (labId: string) => Promise<void>;
    deselectLab: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    // Hash da própria senha do usuário logado NESTA aba — nunca vai pro
    // localStorage (só em memória, some ao atualizar a página). Usado só
    // pra provar identidade em ações sensíveis de admin (criar/editar/excluir
    // analista, redefinir senha de outro) sem reler a senha do banco.
    callerSenhaHash: string | null;
    changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
    // Recalcula e guarda o hash em memória a partir da senha digitada agora
    // (usado quando callerSenhaHash sumiu, ex: depois de um F5) — quem chama
    // ainda precisa tentar a ação real pro servidor confirmar se bateu.
    confirmCallerPassword: (password: string) => Promise<string>;
    clearCallerSenhaHash: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);




export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Analista | null>(null);
    const [currentLab, setCurrentLab] = useState<Lab | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Só em memória (useState, nunca localStorage) — some se a página recarregar.
    const [callerSenhaHash, setCallerSenhaHash] = useState<string | null>(null);

    useEffect(() => {
        // Check local storage for session
        const init = async () => {
            const storedSession = localStorage.getItem("fibertech_session");
            if (storedSession) {
                const parsedUser = JSON.parse(storedSession);
                setUser(parsedUser);

                // If user has a specific lab AND is not a global admin, load it
                if (parsedUser.lab_id && parsedUser.acesso !== 'admin_global') {
                    let lab = await LabService.get(parsedUser.lab_id);
                    if (!lab) {
                        const allLabs = await LabService.list();
                        lab = allLabs.find(l => String(l.id) === String(parsedUser.lab_id));
                    }
                    if (lab) setCurrentLab(lab);
                } else {
                    // Restore selected lab for global admin so F5 keeps them in the lab
                    const storedLab = localStorage.getItem("fibertech_selected_lab");
                    if (storedLab) {
                        setCurrentLab(JSON.parse(storedLab));
                    }
                }
            }

            setIsLoading(false);
            
            // Auto-refresh user from DB in background to sync roles/permissions
            if (storedSession) {
                setTimeout(() => {
                    refreshUser().catch(console.error);
                }, 1000);
            }
        };
        init();
    }, []);

    // Sync currentLab changes to localStorage automatically
    useEffect(() => {
        if (isLoading) return; // Don't touch storage while loading initial state

        if (currentLab) {
            safeSetLocalStorage("fibertech_selected_lab", JSON.stringify(currentLab));
        } else {
            localStorage.removeItem("fibertech_selected_lab");
        }
    }, [currentLab, isLoading]);

    // Heartbeat para manter usuário ONLINE
    useEffect(() => {
        if (!user || isLoading) return;

        // Bate o ponto inicial
        AnalistaService.updateLastActive(user.id).catch(() => {});

        // Continua batendo a cada 10 segundos
        const heartBeat = setInterval(() => {
            AnalistaService.updateLastActive(user.id).catch(() => {});
        }, 10000);

        return () => clearInterval(heartBeat);
    }, [user, isLoading]);

    // Lentidão artificial por laboratório (Admin > só o Alan vê/liga). O Alan
    // nunca sente, mesmo se entrar no laboratório throttled pra conferir.
    useEffect(() => {
        if (isLoading) return;

        const labId = currentLab?.id || user?.lab_id || null;
        if (!user || !labId || user.id === ALAN_USER_ID) {
            disableNetworkThrottle();
            return;
        }

        let cancelled = false;
        labThrottleService.get(labId).then(delayMs => {
            if (cancelled) return;
            if (delayMs > 0) enableNetworkThrottle(delayMs); else disableNetworkThrottle();
        });

        const unsubscribe = labThrottleService.subscribe(labId, delayMs => {
            if (delayMs > 0) enableNetworkThrottle(delayMs); else disableNetworkThrottle();
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [user, currentLab, isLoading]);

    const refreshUser = async () => {
        if (!user) return;
        try {
            const updated = await AnalistaService.get(user.id);
            if (updated) {
                setUser(updated);
                safeSetLocalStorage("fibertech_session", JSON.stringify(updated));
            }
        } catch (e) {
            console.error("Failed to refresh user:", e);
        }
    };

    const login = async (email: string, senha: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const inputHash = await hashPassword(senha);

            // A comparação de senha acontece dentro do Postgres (rpc_login) —
            // o navegador nunca mais lê a coluna senha de ninguém, só manda o
            // hash e recebe de volta os dados do usuário (sem senha) se bater.
            const { data, error } = await supabase.rpc('rpc_login', { p_email: email, p_senha_hash: inputHash });
            if (error) throw error;

            const found: Analista | null = data || null;

            if (found) {
                setUser(found);
                setCallerSenhaHash(inputHash);
                safeSetLocalStorage("fibertech_session", JSON.stringify(found));

                // Load Lab Context
                if (found.acesso === 'admin_global') {
                    // Force clear for global admin on login
                    setCurrentLab(null);
                    localStorage.removeItem("fibertech_selected_lab");
                } else if (found.lab_id) {
                    let lab = await LabService.get(found.lab_id);
                    if (!lab) {
                        const allLabs = await LabService.list();
                        lab = allLabs.find(l => String(l.id) === String(found.lab_id));
                    }
                    if (lab) {
                        setCurrentLab(lab);
                        safeSetLocalStorage("fibertech_selected_lab", JSON.stringify(lab));
                    }
                } else {
                    setCurrentLab(null);
                    localStorage.removeItem("fibertech_selected_lab");
                }

                return true;
            }
            return false;
        } catch (e) {
            console.error(e);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const selectLab = async (labId: string) => {
        if (labId === 'all') {
            const allLab = { id: 'all', nome: 'Todos os Laboratórios' };
            setCurrentLab(allLab as any);
            safeSetLocalStorage("fibertech_selected_lab", JSON.stringify(allLab));
            return;
        }

        let lab = await LabService.get(labId);
        if (!lab) {
            // Fallback: sometimes LabService.get single query fails for string type mismatches, let's find from list
            const allLabs = await LabService.list();
            lab = allLabs.find(l => String(l.id) === String(labId));
        }

        if (lab) {
            setCurrentLab(lab);
            safeSetLocalStorage("fibertech_selected_lab", JSON.stringify(lab));
        }
    };

    const deselectLab = () => {
        setCurrentLab(null);
        localStorage.removeItem("fibertech_selected_lab");
    };

    const logout = () => {
        setUser(null);
        setCurrentLab(null);
        setCallerSenhaHash(null);
        localStorage.removeItem("fibertech_session");
        localStorage.removeItem("fibertech_selected_lab");
    };

    // Troca a própria senha — exige a senha atual (verificada dentro do
    // Postgres, nunca no navegador). Atualiza o hash em memória também, senão
    // ações de admin nesta mesma aba passariam a falhar com a senha antiga.
    const changeOwnPassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
        if (!user) return false;
        const currentHash = await hashPassword(currentPassword);
        const newHash = await hashPassword(newPassword);
        const { data, error } = await supabase.rpc('rpc_change_own_password', {
            p_analista_id: user.id,
            p_current_hash: currentHash,
            p_new_hash: newHash
        });
        if (error) throw error;
        if (data === true) {
            setCallerSenhaHash(newHash);
            return true;
        }
        return false;
    };

    const confirmCallerPassword = async (password: string): Promise<string> => {
        const hash = await hashPassword(password);
        setCallerSenhaHash(hash);
        return hash;
    };

    const clearCallerSenhaHash = () => setCallerSenhaHash(null);

    return (
        <AuthContext.Provider value={{
            user,
            currentLab,
            login,
            logout,
            refreshUser,
            selectLab,
            deselectLab,
            isAuthenticated: !!user,
            isLoading,
            callerSenhaHash,
            changeOwnPassword,
            confirmCallerPassword,
            clearCallerSenhaHash
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
