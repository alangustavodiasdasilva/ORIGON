import { useState } from "react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
    const { changeOwnPassword } = useAuth();
    const { addToast } = useToast();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const reset = () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleSave = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            addToast({ title: "Preencha todos os campos", type: "warning" });
            return;
        }
        if (newPassword.length < 6) {
            addToast({ title: "Senha muito curta", description: "Use pelo menos 6 caracteres.", type: "warning" });
            return;
        }
        if (newPassword !== confirmPassword) {
            addToast({ title: "As senhas não coincidem", type: "warning" });
            return;
        }

        setIsSaving(true);
        try {
            const ok = await changeOwnPassword(currentPassword, newPassword);
            if (ok) {
                addToast({ title: "Senha Alterada", description: "Use a nova senha no próximo login.", type: "success" });
                handleClose();
            } else {
                addToast({ title: "Senha Atual Incorreta", type: "error" });
            }
        } catch (error: any) {
            addToast({ title: "Erro ao Trocar Senha", description: error.message, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Trocar Senha" description="Só você vê essa tela — precisa da sua senha atual">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Senha Atual</Label>
                    <Input
                        type="password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm"
                        autoFocus
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Nova Senha</Label>
                    <Input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="min. 6 caracteres"
                        className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm placeholder:text-neutral-300"
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Confirmar Nova Senha</Label>
                    <Input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
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
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 h-11 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest"
                    >
                        {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
