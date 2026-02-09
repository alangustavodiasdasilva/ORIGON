import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/contexts/ToastContext";
import ParticleBackground from "@/components/shared/ParticleBackground";
import NetflixSplash from "@/components/shared/NetflixSplash";

export default function Login() {
    const { login } = useAuth();
    const { addToast } = useToast();
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSplash, setShowSplash] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !senha) return;

        setIsSubmitting(true);
        try {
            // Validate credentials WITHOUT logging in yet
            const { AnalistaService } = await import("@/entities/Analista");
            const users = await AnalistaService.list();

            console.log("Users found:", users.length, users); // Debugging

            const normalizedEmail = email.toLowerCase().trim();
            const found = users.find(u => u.email.toLowerCase() === normalizedEmail && u.senha === senha);

            if (found) {
                // Show splash screen FIRST
                setShowSplash(true);

                // After splash completes, perform actual login
                setTimeout(async () => {
                    await login(email, senha);
                    addToast({
                        title: "Access Authorized",
                        description: "Welcome to ORIGO Terminal.",
                        type: "success"
                    });
                }, 10000); // Wait for splash to finish
            } else {
                addToast({
                    title: "Authentication Failed",
                    description: "Invalid credentials.",
                    type: "error"
                });
            }
        } catch (error) {
            addToast({
                title: "Connection Error",
                type: "error"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {/* Netflix-style Splash Screen */}
            {showSplash && (
                <NetflixSplash
                    onComplete={() => {
                        // Splash completes, login happens via setTimeout in handleSubmit
                    }}
                />
            )}

            {/* Only show login screen when splash is NOT active */}
            {!showSplash && (
                <>
                    {/* Animated Particles Background */}
                    <ParticleBackground />

                    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white overflow-hidden">
                        {/* Left Side - Brand */}
                        <div className="w-full md:w-1/2 p-12 flex flex-col justify-between border-r border-neutral-200 relative">
                            <div className="space-y-6">
                                <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="50" cy="50" r="48" stroke="#dc2626" strokeWidth="2" />
                                    <circle cx="50" cy="50" r="8" fill="#dc2626" />
                                </svg>
                                <h1 className="text-6xl font-serif tracking-[0.1em] text-neutral-900 leading-none">
                                    ORIGO
                                    <br />
                                    SYSTEM
                                </h1>
                            </div>

                            <div className="space-y-4">
                                <p className="text-xs font-bold uppercase tracking-widest max-w-sm leading-relaxed">
                                    Advanced Fiber Analysis & Classification Terminal
                                </p>
                                <div className="w-12 h-[1px] bg-neutral-300" />
                                <p className="text-[10px] font-mono text-neutral-500 uppercase">
                                    v2.5.0 STABLE
                                </p>
                            </div>
                        </div>

                        {/* Right Side - Login Form */}
                        <div className="w-full md:w-1/2 flex items-center justify-center p-12 bg-neutral-50">
                            <div className="w-full max-w-md space-y-12">
                                <div className="space-y-2">
                                    <h2 className="text-xl font-bold uppercase tracking-widest">Operator Login</h2>
                                    <p className="text-xs font-mono text-neutral-500">Please identify yourself to proceed.</p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-8">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">Terminal Identifier</label>
                                            <Input
                                                type="email"
                                                placeholder="ENTER ID..."
                                                className="h-14 rounded-none border border-neutral-300 bg-white px-4 font-mono text-sm focus:border-neutral-500 focus:ring-0 placeholder:text-neutral-300 transition-colors"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">Secure Key</label>
                                            <Input
                                                type="password"
                                                placeholder="••••••••"
                                                className="h-14 rounded-none border border-neutral-300 bg-white px-4 font-mono text-sm focus:border-neutral-500 focus:ring-0 placeholder:text-neutral-300 transition-colors"
                                                value={senha}
                                                onChange={(e) => setSenha(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full h-16 bg-neutral-900 text-white hover:bg-neutral-700 rounded-none font-bold text-xs uppercase tracking-[0.25em] transition-all flex items-center justify-between px-8 group"
                                    >
                                        <span>Initiate Session</span>
                                        {isSubmitting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                        )}
                                    </Button>
                                </form>

                                <div className="pt-8 border-t border-neutral-200">
                                    <p className="text-[9px] text-neutral-400 uppercase tracking-widest text-center">
                                        Restricted Access • Monitoring Active
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
