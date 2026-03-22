import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { AnalistaService } from "@/entities/Analista";
import type { Analista } from "@/entities/Analista";
import { LabService, type Lab } from "@/entities/Lab";

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
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

/**
 * Utilitário de Hash SHA-256 (Nativa do Browser)
 */
async function hashPassword(password: string): Promise<string> {
    if (!password) return "";
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Mock Seed User for First Run
const SEED_ADMIN: Omit<Analista, 'id' | 'created_at' | 'updated_at'> = {
    nome: "Administrador Global",
    email: "admin@fibertech.com",
    senha: "admin",
    acesso: "admin_global",
    cargo: "Diretor"
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Analista | null>(null);
    const [currentLab, setCurrentLab] = useState<Lab | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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
            // Seed database if empty - wrapped in try-catch to prevent app hang
            try {
                await checkAndSeed();
            } catch (e) {
                console.warn("Database seeding failed (likely offline):", e);
            }

            setIsLoading(false);
        };
        init();
    }, []);

    // Sync currentLab changes to localStorage automatically
    useEffect(() => {
        if (isLoading) return; // Don't touch storage while loading initial state

        if (currentLab) {
            localStorage.setItem("fibertech_selected_lab", JSON.stringify(currentLab));
        } else {
            localStorage.removeItem("fibertech_selected_lab");
        }
    }, [currentLab, isLoading]);

    const checkAndSeed = async () => {
        const users = await AnalistaService.list();

        // Seed Default Admin if empty
        if (users.length === 0) {
            console.log("Seeding admin user...");
            await AnalistaService.create(SEED_ADMIN);
        }

        // Ensure Specific User Exists (User Request)
        const specificUser = users.find(u => u.email === "alangds03@gmail.com");
        if (!specificUser) {
            console.log("Seeding specific global admin...");
            await AnalistaService.create({
                nome: "Alan Dias",
                email: "alangds03@gmail.com",
                senha: "212472",
                acesso: "admin_global",
                cargo: "Desenvolvedor",
                foto: undefined
            });
        }
    };

    const refreshUser = async () => {
        if (!user) return;
        try {
            const updated = await AnalistaService.get(user.id);
            if (updated) {
                setUser(updated);
                localStorage.setItem("fibertech_session", JSON.stringify(updated));
            }
        } catch (e) {
            console.error("Failed to refresh user:", e);
        }
    };

    const login = async (email: string, senha: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const users = await AnalistaService.list();
            const inputHash = await hashPassword(senha);

            // Verifica se existe usuário com o par email/senha (checa ambos para compatibilidade legada se necessário)
            const found = users.find(u => u.email === email && (u.senha === senha || u.senha === inputHash));

            if (found) {
                // Segurança: Remove a senha do objeto de sessão antes de salvar no localStorage
                const { senha: _senha, ...userSession } = found;

                // Se a senha no banco era texto puro, atualiza para hash (Migração Automática)
                if (found.senha === senha) {
                    await AnalistaService.update(found.id, { senha: inputHash });
                    found.senha = inputHash;
                }

                setUser(found);
                localStorage.setItem("fibertech_session", JSON.stringify(userSession));

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
                        localStorage.setItem("fibertech_selected_lab", JSON.stringify(lab));
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
            localStorage.setItem("fibertech_selected_lab", JSON.stringify(allLab));
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
            localStorage.setItem("fibertech_selected_lab", JSON.stringify(lab));
        }
    };

    const deselectLab = () => {
        setCurrentLab(null);
        localStorage.removeItem("fibertech_selected_lab");
    };

    const logout = () => {
        setUser(null);
        setCurrentLab(null);
        localStorage.removeItem("fibertech_session");
        localStorage.removeItem("fibertech_selected_lab");
    };

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
            isLoading
        }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
