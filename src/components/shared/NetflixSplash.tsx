import { useEffect, useState } from 'react';

export default function NetflixSplash({ onComplete }: { onComplete: () => void }) {
    const [stage, setStage] = useState<'intro' | 'logo' | 'fade' | 'complete'>('intro');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Intro fade-in: 0.5 seconds
        const introTimer = setTimeout(() => {
            setStage('logo');
        }, 500);

        // Progress bar animation
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) return 100;
                return prev + 1;
            });
        }, 40); // 4 seconds total (40ms * 100 = 4000ms)

        // Logo animation: 4.5 seconds after intro
        const logoTimer = setTimeout(() => {
            setStage('fade');
        }, 4500);

        // Fade out: 0.5 seconds
        const fadeTimer = setTimeout(() => {
            setStage('complete');
            onComplete();
        }, 5000);

        return () => {
            clearTimeout(introTimer);
            clearTimeout(logoTimer);
            clearTimeout(fadeTimer);
            clearInterval(progressInterval);
        };
    }, [onComplete]);

    if (stage === 'complete') return null;

    return (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-900 transition-opacity duration-700 ${stage === 'intro' ? 'opacity-0' : stage === 'fade' ? 'opacity-0' : 'opacity-100'
                }`}
        >
            <div className="flex flex-col items-center gap-12 animate-scale-in">
                {/* ORIGO Logo with red accent */}
                <svg
                    width="200"
                    height="200"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="animate-pulse-slow"
                >
                    {/* Outer circle with red stroke */}
                    <circle
                        cx="50"
                        cy="50"
                        r="48"
                        stroke="#dc2626"
                        strokeWidth="2"
                        className="animate-draw-circle"
                    />
                    {/* Inner red dot */}
                    <circle
                        cx="50"
                        cy="50"
                        r="8"
                        fill="#dc2626"
                        className="animate-scale-pulse"
                    />
                </svg>

                {/* ORIGO Text */}
                <h1 className="text-7xl font-serif tracking-[0.3em] text-white animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                    ORIGO
                </h1>

                {/* Subtitle */}
                <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                    Fiber Analysis System
                </p>

                {/* Loading Progress Bar */}
                <div className="w-64 h-1 bg-neutral-800 rounded-full overflow-hidden animate-fade-in-up" style={{ animationDelay: '0.9s' }}>
                    <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-100 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Loading Text */}
                <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest animate-fade-in-up" style={{ animationDelay: '0.9s' }}>
                    INITIALIZING SYSTEM...
                </p>
            </div>
        </div>
    );
}
