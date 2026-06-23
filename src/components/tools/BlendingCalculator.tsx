import { useState } from "react";
import { Calculator, Plus, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDecimalBR } from "@/services/ocrExtraction";

interface BlendItem {
    id: string;
    weight: number; // Percentual ou peso em kg
    mic: number;
    str: number;
    len: number;
    unf: number;
}

export default function BlendingCalculator() {
    const [items, setItems] = useState<BlendItem[]>([
        { id: '1', weight: 50, mic: 4.2, str: 29.5, len: 1.15, unf: 82.0 },
        { id: '2', weight: 50, mic: 3.8, str: 28.0, len: 1.12, unf: 80.5 }
    ]);

    const addItem = () => {
        const id = (items.length + 1).toString();
        setItems([...items, { id, weight: 0, mic: 0, str: 0, len: 0, unf: 0 }]);
    };

    const updateItem = (index: number, field: keyof BlendItem, value: number) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const calculateBlend = () => {
        let totalWeight = 0;
        let wMic = 0, wStr = 0, wLen = 0, wUnf = 0;

        items.forEach(item => {
            totalWeight += item.weight;
            wMic += item.mic * item.weight;
            wStr += item.str * item.weight;
            wLen += item.len * item.weight;
            wUnf += item.unf * item.weight;
        });

        if (totalWeight === 0) return { mic: 0, str: 0, len: 0, unf: 0 };

        return {
            mic: wMic / totalWeight,
            str: wStr / totalWeight,
            len: wLen / totalWeight,
            unf: wUnf / totalWeight
        };
    };

    const result = calculateBlend();

    return (
        <Card className="premium-card overflow-hidden border-border bg-card">
            <CardHeader className="bg-accent/50 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Calculator className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-black uppercase italic text-foreground tracking-tighter">Simulador de Mistura</CardTitle>
                        <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Previsão de blending de fardos</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                    {items.map((item, idx) => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 p-3 bg-accent/30 rounded-xl border border-border items-end">
                            <div className="col-span-1 flex items-center justify-center pb-3">
                                <div className="text-[10px] font-black text-muted">#{idx + 1}</div>
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[8px] uppercase font-black text-muted">Peso/Qtd</Label>
                                <Input
                                    type="number"
                                    value={item.weight}
                                    onChange={e => updateItem(idx, 'weight', parseFloat(e.target.value))}
                                    className="h-8 text-[10px] font-bold"
                                />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[8px] uppercase font-black text-muted">MIC</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={item.mic}
                                    onChange={e => updateItem(idx, 'mic', parseFloat(e.target.value))}
                                    className="h-8 text-[10px] font-bold"
                                />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[8px] uppercase font-black text-muted">STR</Label>
                                <Input
                                    type="number"
                                    step="1"
                                    value={item.str}
                                    onChange={e => updateItem(idx, 'str', parseFloat(e.target.value))}
                                    className="h-8 text-[10px] font-bold"
                                />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[8px] uppercase font-black text-muted">UNF</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={item.unf}
                                    onChange={e => updateItem(idx, 'unf', parseFloat(e.target.value))}
                                    className="h-8 text-[10px] font-bold"
                                />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[8px] uppercase font-black text-muted">LEN</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={item.len}
                                    onChange={e => updateItem(idx, 'len', parseFloat(e.target.value))}
                                    className="h-8 text-[10px] font-bold"
                                />
                            </div>
                            <div className="col-span-1 pb-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-400 hover:text-rose-600" onClick={() => removeItem(idx)}>
                                    <span className="text-lg">×</span>
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <Button onClick={addItem} variant="outline" className="w-full text-[10px] h-10 border-dashed border-2">
                    <Plus className="mr-2 h-3 w-3" /> Adicionar Componente
                </Button>

                <div className="pt-4 border-t border-border mt-4">
                    <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Layers className="h-5 w-5 text-blue-400" />
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Resultado da Mistura</h4>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">Média Ponderada Estimada</p>
                            </div>
                        </div>
                        <div className="flex gap-4 text-right">
                            <div>
                                <span className="block text-[8px] font-black text-slate-500 uppercase">MIC</span>
                                <span className="text-lg font-black italic">{formatDecimalBR(result.mic, 2)}</span>
                            </div>
                            <div>
                                <span className="block text-[8px] font-black text-slate-500 uppercase">STR</span>
                                <span className="text-lg font-black italic">{formatDecimalBR(result.str, 0)}</span>
                            </div>
                            <div>
                                <span className="block text-[8px] font-black text-slate-500 uppercase">UNF</span>
                                <span className="text-lg font-black italic">{formatDecimalBR(result.unf, 1)}</span>
                            </div>
                            <div>
                                <span className="block text-[8px] font-black text-slate-500 uppercase">LEN</span>
                                <span className="text-lg font-black italic">{formatDecimalBR(result.len, 2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
