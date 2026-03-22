import { createContext, useContext, useState, type ReactNode } from "react";

interface LabContextType {
    selectedLabId: string | null;
    setSelectedLabId: (labId: string | null) => void;
}

const LabContext = createContext<LabContextType>({} as LabContextType);

const STORAGE_KEY = 'fibertech_selected_lab';

export function LabProvider({ children }: { children: ReactNode }) {
    const [selectedLabId, setSelectedLabIdState] = useState<string | null>(
        () => localStorage.getItem(STORAGE_KEY)
    );

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

// eslint-disable-next-line react-refresh/only-export-components
export const useLab = () => useContext(LabContext);
