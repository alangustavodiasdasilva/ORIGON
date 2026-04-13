import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);

        // Se o erro for de carregamento de módulo dinâmico (Vite/Webpack chunk error)
        // Geralmente acontece quando fazemos um deploy e o usuário está com uma versão antiga aberta.
        if (error.message.includes("Failed to fetch dynamically imported module") || 
            error.message.includes("Loading chunk")) {
            
            const lastReload = localStorage.getItem('last-chunk-reload');
            const now = Date.now();
            
            // Evita loop infinito de recarregamento (limite de 1 vez a cada 10 segundos)
            if (!lastReload || (now - parseInt(lastReload)) > 10000) {
                localStorage.setItem('last-chunk-reload', now.toString());
                window.location.reload();
            }
        }
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
                    <p className="text-neutral-600 mb-4">{this.state.error?.message}</p>
                    <button
                        className="px-4 py-2 bg-black text-white rounded hover:bg-neutral-800"
                        onClick={() => window.location.reload()}
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
