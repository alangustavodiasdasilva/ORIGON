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

                // If user has a specific lab, load it
                if (parsedUser.lab_id) {
                    const lab = await LabService.get(parsedUser.lab_id);
                    if (lab) setCurrentLab(lab);
                }
            }
            // Seed database if empty
            await checkAndSeed();

            setIsLoading(false);
        };
        init();
    }, []);

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
            const found = users.find(u => u.email === email && u.senha === senha);

            if (found) {
                setUser(found);
                localStorage.setItem("fibertech_session", JSON.stringify(found));

                // Load Lab Context
                if (found.lab_id) {
                    const lab = await LabService.get(found.lab_id);
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
        const lab = await LabService.get(labId);
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

export const useAuth = () => useContext(AuthContext);
