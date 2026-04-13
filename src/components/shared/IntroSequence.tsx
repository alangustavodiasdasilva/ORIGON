import { useState, useEffect } from "react";

export default function IntroSequence({ onFinish }: { onFinish: () => void }) {
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Step 1: Initial Reveal
        const t1 = setTimeout(() => setStep(1), 500);
        // Step 2: Full Display
        const t2 = setTimeout(() => setStep(2), 2000);
        // Step 3: Finish
        const t3 = setTimeout(() => onFinish(), 3200);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [onFinish]);

    return (
        <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center overflow-hidden">
            <div className={`relative transition-all duration-[1500ms] flex flex-col items-center justify-center
                ${step === 0 ? "opacity-0 scale-95" : "opacity-100 scale-100"}
                ${step === 2 ? "opacity-0 scale-105" : ""}
            `}>
                {/* ORIGO Logo Animation */}
                <div className="mb-8 relative">
                    <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-[spin_10s_linear_infinite]">
                        <circle cx="50" cy="50" r="48" stroke="black" strokeWidth="1" strokeDasharray="4 4" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-4 h-4 bg-black rounded-full" />
                    </div>
                </div>

                <div className="text-center space-y-4">
                    <h1 className="text-7xl font-serif text-black tracking-[0.05em] leading-none">
                        ORIGO
                    </h1>
                    <div className="h-[1px] w-24 bg-black mx-auto" />
                    <p className="text-xs font-mono font-bold uppercase tracking-[0.5em] text-neutral-500">
                        System v2.5
                    </p>
                </div>
            </div>
        </div>
    );
}
