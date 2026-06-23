import React, { createContext, useContext, useState, useCallback } from "react";

type ToastType = "success" | "error" | "info" | "destructive" | "warning";

interface Toast {
    id: string;
    title: string;
    description?: string;
    type: ToastType;
}

interface AddToastProps {
    title: string;
    description?: string;
    type?: ToastType;
    variant?: ToastType;
}

interface ToastContextValue {
    addToast: (props: AddToastProps) => void;
    toast: (props: AddToastProps) => void;
    toasts: Toast[];
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback(({ title, description, type, variant }: AddToastProps) => {
        const id = Math.random().toString(36).substring(2, 9);
        const finalType = type || variant || "info";

        setToasts((prev) => [...prev, { id, title, description, type: finalType }]);

        setTimeout(() => {
            removeToast(id);
        }, 5000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, toast: addToast, toasts }}>
            {children}
            {/* Default toaster removed - Layout handles it now */}
        </ToastContext.Provider>
    );
}
