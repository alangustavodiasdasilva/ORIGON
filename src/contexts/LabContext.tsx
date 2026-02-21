import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface LabContextType {
    selectedLabId: string | null;
    setSelectedLabId: (labId: string | null) => void;
}

const LabContext = createContext<LabContextType>({} as LabContextType);

const STORAGE_KEY = 'fibertech_selected_lab';

export function LabProvider({ children }: { children: ReactNode }) {
    const [selectedLabId, setSelectedLabIdState] = useState<string | null>(null);

    useEffect(() => {
        // Load saved lab selection from localStorage
        const savedLabId = localStorage.getItem(STORAGE_KEY);
        if (savedLabId) {
            setSelectedLabIdState(savedLabId);
        }
    }, []);

    const setSelectedLabId = (labId: string | null) => {
        setSelectedLabIdState(labId);
        if (labId) {
            localStorage.setItem(STORAGE_KEY, labId);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    };

    return (
        <LabContext.Provider value={{ selectedLabId, setSelectedLabId }}>
            {children}
        </LabContext.Provider>
    );
}

export const useLab = () => useContext(LabContext);
