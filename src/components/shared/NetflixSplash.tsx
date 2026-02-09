import { useEffect, useState } from 'react';

export default function NetflixSplash({ onComplete }: { onComplete: () => void }) {
    const [stage, setStage] = useState<'intro' | 'logo' | 'fade' | 'complete'>('intro');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Play cinematic sound on mount
        playSound();

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
        }, 90); // 9 seconds total (90ms * 100 = 9000ms)

        // Logo animation: 9 seconds after intro
        const logoTimer = setTimeout(() => {
            setStage('fade');
        }, 9500);

        // Fade out: 0.5 seconds
        const fadeTimer = setTimeout(() => {
            setStage('complete');
            onComplete();
        }, 10000);

        return () => {
            clearTimeout(introTimer);
            clearTimeout(logoTimer);
            clearTimeout(fadeTimer);
            clearInterval(progressInterval);
        };
    }, [onComplete]);

    // Cinematic audio sequence
    const playSound = () => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const masterGain = audioContext.createGain();
            masterGain.connect(audioContext.destination);
            masterGain.gain.value = 0.3; // Overall volume

            // Deep bass hit at start
            const bass = audioContext.createOscillator();
            const bassGain = audioContext.createGain();
            bass.type = 'sine';
            bass.frequency.setValueAtTime(55, audioContext.currentTime); // Low A
            bass.connect(bassGain);
            bassGain.connect(masterGain);
            bassGain.gain.setValueAtTime(0.5, audioContext.currentTime);
            bassGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.5);
            bass.start(audioContext.currentTime);
            bass.stop(audioContext.currentTime + 1.5);

            // Rising harmonic pad
            const playNote = (freq: number, startTime: number, duration: number, volume: number = 0.15) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                osc.connect(gain);
                gain.connect(masterGain);
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(volume, startTime + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            // Cinematic chord progression
            const now = audioContext.currentTime;

            // C major chord (hopeful, opening)
            playNote(261.63, now + 0.5, 3, 0.12); // C4
            playNote(329.63, now + 0.5, 3, 0.10); // E4
            playNote(392.00, now + 0.5, 3, 0.08); // G4

            // A minor chord (depth)
            playNote(220.00, now + 2.5, 3, 0.12); // A3
            playNote(261.63, now + 2.5, 3, 0.10); // C4
            playNote(329.63, now + 2.5, 3, 0.08); // E4

            // F major chord (resolution)
            playNote(174.61, now + 4.5, 3, 0.12); // F3
            playNote(220.00, now + 4.5, 3, 0.10); // A3
            playNote(261.63, now + 4.5, 3, 0.08); // C4

            // Final G major (triumph)
            playNote(196.00, now + 6.5, 3.5, 0.15); // G3
            playNote(246.94, now + 6.5, 3.5, 0.12); // B3
            playNote(293.66, now + 6.5, 3.5, 0.10); // D4

        } catch (e) {
            console.log('Audio not supported:', e);
        }
    };

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
