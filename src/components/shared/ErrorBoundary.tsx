import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-neutral-100 text-black font-sans">
                    <div className="max-w-2xl w-full bg-white p-8 border border-black shadow-xl space-y-6">
                        <h1 className="text-2xl font-serif text-red-600">System Error</h1>
                        <div className="p-4 bg-neutral-50 border border-neutral-200 font-mono text-xs whitespace-pre-wrap overflow-auto max-h-[400px]">
                            <p className="font-bold mb-2">{this.state.error?.toString()}</p>
                            <p className="text-neutral-500">{this.state.errorInfo?.componentStack}</p>
                        </div>
                        <div className="flex gap-4">
                            <Button
                                onClick={() => window.location.reload()}
                                className="rounded-none bg-black text-white hover:bg-neutral-800"
                            >
                                RELOAD SYSTEM
                            </Button>
                            <Button
                                onClick={() => window.location.href = '/'}
                                variant="outline"
                                className="rounded-none border-black text-black hover:bg-neutral-100"
                            >
                                GO TO HOME
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
