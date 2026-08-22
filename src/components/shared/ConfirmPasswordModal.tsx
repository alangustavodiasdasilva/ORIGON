import { useState } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmPasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string) => void;
    isSubmitting?: boolean;
}

// Reaparece quando a página é recarregada e a ação de admin precisa provar
// identidade de novo (o hash da senha só vive em memória, nunca em
// localStorage — ver callerSenhaHash em AuthContext.tsx).
export function ConfirmPasswordModal({ isOpen, onClose, onConfirm, isSubmitting }: ConfirmPasswordModalProps) {
    const [password, setPassword] = useState("");

    const handleConfirm = () => {
        if (!password) return;
        onConfirm(password);
    };

    const handleClose = () => {
        setPassword("");
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Confirme Sua Senha" description="Necessário pra ações administrativas — sua sessão foi recarregada">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Sua Senha</Label>
                    <Input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                    />
                </div>
                <div className="flex gap-4 pt-4 border-t border-neutral-100">
                    <Button
                        onClick={handleClose}
                        variant="ghost"
                        className="flex-1 h-11 rounded-none border border-black hover:bg-neutral-100 text-[10px] font-bold uppercase tracking-widest"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isSubmitting || !password}
                        className="flex-1 h-11 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest"
                    >
                        {isSubmitting ? "Confirmando..." : "Confirmar"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
