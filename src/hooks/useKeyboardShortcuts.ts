import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/contexts/ToastContext';

/**
 * Global Keyboard Shortcuts Hook
 * Adds keyboard shortcuts across the entire application
 */
export function useKeyboardShortcuts() {
    const navigate = useNavigate();
    const { addToast } = useToast();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if user is typing in an input
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                // Allow Ctrl+S even in inputs
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    addToast({ title: 'Salvamento automático ativado', type: 'info' });
                }
                return;
            }

            const ctrl = e.ctrlKey || e.metaKey;

            // Global shortcuts
            switch (e.key.toLowerCase()) {
                // Navigation shortcuts
                case 'h':
                    if (ctrl && e.shiftKey) {
                        e.preventDefault();
                        navigate('/');
                        addToast({ title: 'Navegando para Início', type: 'info' });
                    }
                    break;

                case 'l':
                    if (ctrl && e.shiftKey) {
                        e.preventDefault();
                        navigate('/lotes');
                        addToast({ title: 'Navegando para Lotes', type: 'info' });
                    }
                    break;

                case 'i':
                    if (ctrl && e.shiftKey) {
                        e.preventDefault();
                        navigate('/interlaboratorial');
                        addToast({ title: 'Navegando para Interlaboratorial', type: 'info' });
                    }
                    break;

                case 'q':
                    if (ctrl && e.shiftKey) {
                        e.preventDefault();
                        navigate('/quality');
                        addToast({ title: 'Navegando para Qualidade', type: 'info' });
                    }
                    break;

                case 'a':
                    if (ctrl && e.shiftKey) {
                        e.preventDefault();
                        navigate('/admin');
                        addToast({ title: 'Navegando para Admin', type: 'info' });
                    }
                    break;

                // Help shortcut
                case '?':
                    if (e.shiftKey) {
                        e.preventDefault();
                        showKeyboardShortcutsModal();
                    }
                    break;

                // Refresh data
                case 'r':
                    if (ctrl) {
                        e.preventDefault();
                        window.location.reload();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate, addToast]);
}

/**
 * Show keyboard shortcuts help modal
 */
function showKeyboardShortcutsModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-8 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white border-2 border-black max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            <div class="p-6 border-b border-black bg-neutral-50 flex items-center justify-between">
                <div>
                    <h2 class="text-xl font-serif font-bold">Atalhos de Teclado</h2>
                    <p class="text-xs text-neutral-500 uppercase tracking-widest mt-1">Keyboard Shortcuts</p>
                </div>
                <button class="close-modal p-2 hover:bg-black hover:text-white transition-colors">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="p-6 space-y-6">
                <!-- Search -->
                <div>
                    <h3 class="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-3">Busca</h3>
                    <div class="space-y-2">
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Busca Global</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + K</kbd>
                        </div>
                    </div>
                </div>

                <!-- Navigation -->
                <div>
                    <h3 class="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-3">Navegação</h3>
                    <div class="space-y-2">
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Início</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + Shift + H</kbd>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Lotes</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + Shift + L</kbd>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Interlaboratorial</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + Shift + I</kbd>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Qualidade</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + Shift + Q</kbd>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Admin</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + Shift + A</kbd>
                        </div>
                    </div>
                </div>

                <!-- General -->
                <div>
                    <h3 class="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-3">Geral</h3>
                    <div class="space-y-2">
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Salvar (onde aplicável)</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Ctrl + S</kbd>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Fechar Modal/Dialog</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">ESC</kbd>
                        </div>
                        <div class="flex items-center justify-between p-3 bg-neutral-50 rounded">
                            <span class="text-sm">Mostrar Este Menu</span>
                            <kbd class="px-3 py-1 text-xs font-mono bg-white border-2 border-black">Shift + ?</kbd>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });

    // Close on button click
    modal.querySelector('.close-modal')?.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Close on ESC
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            window.removeEventListener('keydown', handleEsc);
        }
    };
    window.addEventListener('keydown', handleEsc);

    document.body.appendChild(modal);
}
