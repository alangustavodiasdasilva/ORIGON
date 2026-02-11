import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, description, children }: ModalProps) {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in text-foreground">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-lg bg-card border border-border rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden animate-modal-in transition-colors duration-300">
                <div className="p-10 pb-4 flex items-center justify-between">
                    <div className="space-y-1.5">
                        <h3 className="text-2xl font-black tracking-tighter uppercase italic leading-none">{title}</h3>
                        {description && (
                            <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-relaxed">{description}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted hover:text-foreground hover:bg-accent rounded-full transition-all cursor-pointer"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-10 pt-4">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
