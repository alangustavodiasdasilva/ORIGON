import { useEffect, useState } from "react";

export default function LoadingScreen() {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                return prev + 2;
            });
        }, 50);

        return () => clearInterval(timer);
    }, []);

    return (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50 animate-fade-in text-black font-sans">
            <div className="flex flex-col items-center gap-12">
                {/* Logo Section */}
                <div className="flex flex-col items-center gap-6 animate-slide-up">
                    <div className="relative">
                        <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse-slow">
                            <circle cx="50" cy="50" r="48" stroke="black" strokeWidth="3" />
                            <circle cx="50" cy="50" r="6" fill="black" />

                            {/* Rotating Ring */}
                            <g className="animate-spin-slow origin-center">
                                <circle cx="50" cy="50" r="32" stroke="black" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
                            </g>
                        </svg>
                    </div>

                    <div className="text-center space-y-2">
                        <h1 className="text-5xl font-serif tracking-[0.15em] text-black leading-none">ORIGO</h1>
                        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-400">
                            System Interface
                        </p>
                    </div>
                </div>

                {/* Loading Indicator */}
                <div className="w-64 space-y-3">
                    <div className="h-[2px] w-full bg-neutral-100 overflow-hidden">
                        <svg width="100%" height="2" className="block">
                            <rect width={`${progress}%`} height="100%" fill="black" className="transition-all duration-300 ease-out" />
                        </svg>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                        <span>Loading Modules</span>
                        <span>{progress}%</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-12 text-center space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-300">
                    FIBERTECH HVI INTELLIGENCE
                </p>
            </div>

        </div>
    );
}
