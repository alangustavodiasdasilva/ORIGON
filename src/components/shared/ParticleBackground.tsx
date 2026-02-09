import { useEffect, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
}

export default function ParticleBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Mouse position and click state
        let mouseX = -1000;
        let mouseY = -1000;
        let clicking = false;

        // Set canvas size
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Track mouse movement
        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };
        window.addEventListener('mousemove', handleMouseMove);

        // Track mouse clicks
        const handleMouseDown = () => { clicking = true; };
        const handleMouseUp = () => { clicking = false; };
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        // Create particles
        const particleCount = 100;
        const particles: Particle[] = [];

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.3 + 0.3 // More visible
            });
        }

        // Animation loop
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update and draw particles
            particles.forEach((particle, i) => {
                // Calculate distance to mouse
                const dx = mouseX - particle.x;
                const dy = mouseY - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Subtle attraction when clicking
                const attractionRadius = clicking ? 180 : 100;
                const attractionStrength = clicking ? 0.15 : 0.08;

                // Attraction to mouse
                if (distance < attractionRadius) {
                    const force = (attractionRadius - distance) / attractionRadius;
                    particle.vx += (dx / distance) * force * attractionStrength;
                    particle.vy += (dy / distance) * force * attractionStrength;
                }

                // Apply velocity
                particle.x += particle.vx;
                particle.y += particle.vy;

                // Gentle friction
                particle.vx *= 0.98;
                particle.vy *= 0.98;

                // Maintain minimum movement
                const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
                if (speed < 0.3) {
                    const angle = Math.random() * Math.PI * 2;
                    particle.vx += Math.cos(angle) * 0.15;
                    particle.vy += Math.sin(angle) * 0.15;
                }

                // Wrap around edges
                if (particle.x < 0) particle.x = canvas.width;
                if (particle.x > canvas.width) particle.x = 0;
                if (particle.y < 0) particle.y = canvas.height;
                if (particle.y > canvas.height) particle.y = 0;

                // Draw simple particle (no glow)
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(220, 38, 38, ${particle.opacity})`;
                ctx.fill();

                // Draw very subtle connections
                particles.slice(i + 1).forEach(otherParticle => {
                    const dx = particle.x - otherParticle.x;
                    const dy = particle.y - otherParticle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 100) {
                        ctx.beginPath();
                        ctx.moveTo(particle.x, particle.y);
                        ctx.lineTo(otherParticle.x, otherParticle.y);
                        const opacity = (1 - distance / 100) * 0.05; // Very subtle
                        ctx.strokeStyle = `rgba(220, 38, 38, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                });
            });

            requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: 1 }}
        />
    );
}
