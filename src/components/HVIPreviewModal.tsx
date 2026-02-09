import { X, Download, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Sample } from '@/entities/Sample';
import { useLanguage } from '@/contexts/LanguageContext';

interface HVIPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    content: string;
    filename: string;
    machineModel: 'USTER' | 'PREMIER';
    originalSample: Sample;
    generatedValues: {
        mic: number;
        len: number;
        unf: number;
        str: number;
        rd: number;
        b: number;
    };
}

export default function HVIPreviewModal({
    isOpen,
    onClose,
    onConfirm,
    content,
    filename,
    machineModel,
    originalSample,
    generatedValues
}: HVIPreviewModalProps) {
    const { t } = useLanguage();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-6xl max-h-[90vh] bg-white flex flex-col shadow-2xl border border-black">
                {/* Header */}
                <div className="h-16 bg-white border-b border-black flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <Eye className="h-5 w-5 text-black" />
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-black">
                                Comparativo: Valores Atuais vs Arquivo HVI
                            </h3>
                            <p className="text-[10px] font-mono text-neutral-400 uppercase">
                                {machineModel} • {filename}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-100 rounded transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-8 bg-neutral-50">
                    <div className="grid grid-cols-2 gap-6 mb-6 relative">
                        {/* LEFT: Current Sample Values */}
                        <div className="bg-white border-2 border-blue-500 p-6">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-200">
                                <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">A</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm uppercase tracking-widest text-blue-600">
                                        Valores Digitados
                                    </h4>
                                    <p className="text-xs text-neutral-500">{t('hvi.sample_id')}{originalSample.amostra_id}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">MIC</span>
                                    <span className="text-lg font-bold text-blue-600">{originalSample.mic || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">LEN</span>
                                    <span className="text-lg font-bold text-blue-600">{originalSample.len || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">UNF</span>
                                    <span className="text-lg font-bold text-blue-600">{originalSample.unf || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">STR</span>
                                    <span className="text-lg font-bold text-blue-600">{originalSample.str || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">RD</span>
                                    <span className="text-lg font-bold text-blue-600">{originalSample.rd || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">+B</span>
                                    <span className="text-lg font-bold text-blue-600">{originalSample.b || '-'}</span>
                                </div>

                                <div className="mt-4 pt-3 border-t-2 border-blue-200">
                                    <div className="flex items-center gap-2">
                                        {originalSample.cor && (
                                            <div
                                                className="h-6 w-6 rounded border border-neutral-300"
                                                style={{ backgroundColor: originalSample.cor }}
                                            />
                                        )}
                                        <span className="text-xs text-neutral-500">
                                            Cor: {originalSample.cor || 'Não definida'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Arrow */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                            <div className="h-12 w-12 rounded-full bg-black flex items-center justify-center shadow-xl">
                                <ArrowRight className="h-6 w-6 text-white" />
                            </div>
                        </div>

                        {/* RIGHT: Generated HVI Values */}
                        <div className="bg-white border-2 border-green-500 p-6">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-green-200">
                                <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">B</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm uppercase tracking-widest text-green-600">
                                        Valores no Arquivo HVI
                                    </h4>
                                    <p className="text-xs text-neutral-500">
                                        Média técnica referente à cor {originalSample.cor}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">MIC</span>
                                    <span className="text-lg font-bold text-green-600">{generatedValues.mic.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">LEN</span>
                                    <span className="text-lg font-bold text-green-600">{generatedValues.len.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">UNF</span>
                                    <span className="text-lg font-bold text-green-600">{generatedValues.unf.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">STR</span>
                                    <span className="text-lg font-bold text-green-600">{generatedValues.str.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">RD</span>
                                    <span className="text-lg font-bold text-green-600">{generatedValues.rd.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-neutral-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">+B</span>
                                    <span className="text-lg font-bold text-green-600">{generatedValues.b.toFixed(1)}</span>
                                </div>

                                <div className="mt-4 pt-3 border-t-2 border-green-200">
                                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                                        <span className="inline-block h-2 w-2 rounded-full bg-green-500"></span>
                                        6 leituras com variação no arquivo
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Full File Preview */}
                    <div className="bg-white border border-neutral-200 p-6">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">
                            Prévia Completa do Arquivo
                        </h4>
                        <div className="bg-neutral-50 p-4 border border-neutral-200 font-mono text-xs overflow-auto max-h-64">
                            <pre className="whitespace-pre-wrap break-words">{content}</pre>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="h-20 bg-white border-t border-black flex items-center justify-between px-8 shrink-0">
                    <div className="text-xs text-neutral-500">
                        <p className="font-bold uppercase tracking-widest mb-1">⚠️ Importante:</p>
                        <p>O arquivo HVI utiliza a média dos dados para a cor <span className="font-bold text-black">{originalSample?.cor}</span>.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            className="h-12 px-6 rounded-none border border-neutral-200 text-black hover:bg-neutral-100 font-bold text-[10px] uppercase tracking-widest transition-colors"
                        >
                            {t('hvi.cancel')}
                        </Button>
                        <Button
                            onClick={onConfirm}
                            className="h-12 px-8 rounded-none bg-black text-white hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {t('hvi.confirm_download')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
