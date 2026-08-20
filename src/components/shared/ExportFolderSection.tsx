import { useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { exportFolderService, type ExportFolderInfo } from "@/services/exportFolder.service";
import {
    getFolderHandle,
    saveFolderHandle,
    removeFolderHandle,
    ensureFolderPermission,
    isFolderPickerSupported
} from "@/lib/folderHandleStore";

// Pasta de exportação automática: escolhe uma pasta NESTE computador (File System
// Access API) pra onde os arquivos Uster/Premier gerados passam a ir direto, sem
// abrir a janela de "Salvar como". O handle da pasta é local ao navegador — cada
// computador que gera arquivos precisa escolher a própria pasta aqui (não dá pra
// configurar uma vez e valer pra rede inteira — é uma restrição de segurança do
// navegador, não do Origo). Por isso fica visível pra TODO usuário, não só admin:
// quem estiver sentado em cada computador do laboratório é quem precisa configurar.
export default function ExportFolderSection({ labId, labName }: { labId: string; labName: string }) {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [info, setInfo] = useState<ExportFolderInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [localStatus, setLocalStatus] = useState<'checking' | 'none' | 'needs-permission' | 'ready'>('checking');
    const [isBusy, setIsBusy] = useState(false);

    const checkLocalHandle = async () => {
        setLocalStatus('checking');
        const handle = await getFolderHandle(labId);
        if (!handle) {
            setLocalStatus('none');
            return;
        }
        try {
            const granted = await handle.queryPermission({ mode: 'readwrite' });
            setLocalStatus(granted === 'granted' ? 'ready' : 'needs-permission');
        } catch {
            setLocalStatus('needs-permission');
        }
    };

    useEffect(() => {
        setIsLoading(true);
        exportFolderService.get(labId).then(i => { setInfo(i); setIsLoading(false); }).catch(() => setIsLoading(false));
        checkLocalHandle();

        const unsubscribe = exportFolderService.subscribe(list => {
            setInfo(list.find(i => i.labId === labId) || null);
        });
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [labId]);

    const handleChooseFolder = async () => {
        if (!isFolderPickerSupported()) {
            addToast({
                title: "Não Suportado Nesse Navegador",
                description: "Escolher pasta direto só funciona no Chrome ou Edge.",
                type: "warning"
            });
            return;
        }
        setIsBusy(true);
        try {
            const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
            await saveFolderHandle(labId, handle);
            await exportFolderService.set(labId, handle.name, user?.nome || "Usuário");
            addToast({
                title: "Pasta Configurada",
                description: `Os arquivos gerados agora vão direto para "${handle.name}" neste computador.`,
                type: "success"
            });
            await checkLocalHandle();
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                addToast({ title: "Erro ao Escolher Pasta", description: err.message, type: "error" });
            }
        } finally {
            setIsBusy(false);
        }
    };

    const handleReactivate = async () => {
        const handle = await getFolderHandle(labId);
        if (!handle) return;
        setIsBusy(true);
        const granted = await ensureFolderPermission(handle);
        setIsBusy(false);
        setLocalStatus(granted ? 'ready' : 'needs-permission');
        if (!granted) addToast({ title: "Permissão Negada", type: "error" });
    };

    const handleRemove = async () => {
        setIsBusy(true);
        try {
            await removeFolderHandle(labId);
            await exportFolderService.remove(labId);
            setLocalStatus('none');
            addToast({ title: "Pasta Removida", description: "Os arquivos voltam a ser baixados normalmente pelo navegador.", type: "info" });
        } catch (err: any) {
            addToast({ title: "Erro ao Remover", description: err.message, type: "error" });
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div className="border border-neutral-200 bg-white p-8 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-black pb-4">
                <div>
                    <h3 className="text-xl font-serif">Pasta de Exportação Automática</h3>
                    {labName && <p className="text-xs text-neutral-500 mt-1">Laboratório: {labName}</p>}
                </div>
                <FolderOpen className="h-5 w-5" />
            </div>

            <p className="text-xs text-neutral-500 max-w-2xl">
                Escolha uma pasta neste computador — os arquivos Uster/Premier gerados passam a cair
                direto nela, sem abrir a janela de "Salvar como" do navegador. Só funciona no Chrome
                ou Edge, e precisa ser configurado em CADA computador que gera arquivos: não é um
                caminho de rede, é uma pasta local escolhida aqui mesmo. Se os computadores do
                laboratório já enxergam uma pasta de rede compartilhada, escolha ela aqui em cada um
                pra todos caírem no mesmo lugar.
            </p>

            {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            ) : (
                <div className="space-y-4">
                    {info && (
                        <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                            Configurado como "{info.folderName}" por {info.updatedBy}
                            {info.updatedAt ? ` em ${new Date(info.updatedAt).toLocaleString('pt-BR')}` : ''}
                        </p>
                    )}

                    {localStatus === 'ready' && (
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">● Ativo neste computador</p>
                    )}
                    {localStatus === 'needs-permission' && (
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">
                            Pasta escolhida, mas a permissão expirou neste computador
                        </p>
                    )}
                    {localStatus === 'none' && (
                        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                            {info ? "Ainda não configurado neste computador" : "Nenhuma pasta configurada"}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <Button
                            onClick={handleChooseFolder}
                            disabled={isBusy}
                            className="h-11 px-6 rounded-none font-black text-[10px] uppercase tracking-widest bg-black hover:bg-neutral-800 text-white flex items-center gap-2"
                        >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                            {localStatus === 'ready' || localStatus === 'needs-permission' ? "Trocar Pasta" : "Escolher Pasta"}
                        </Button>
                        {localStatus === 'needs-permission' && (
                            <Button
                                onClick={handleReactivate}
                                disabled={isBusy}
                                className="h-11 px-6 rounded-none font-black text-[10px] uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white"
                            >
                                Reativar Acesso
                            </Button>
                        )}
                        {(info || localStatus === 'ready' || localStatus === 'needs-permission') && (
                            <Button
                                onClick={handleRemove}
                                disabled={isBusy}
                                variant="outline"
                                className="h-11 px-6 rounded-none font-black text-[10px] uppercase tracking-widest"
                            >
                                Remover
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
