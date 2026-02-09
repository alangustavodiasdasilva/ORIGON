import { useMemo } from "react";
import type { Sample } from "@/entities/Sample";
import { Card, CardContent } from "@/components/ui/card";

interface ExportPreviewProps {
    samples: Sample[];
    separator: string;
    hasHeader: boolean;
    decimalSeparator: "." | ",";
    mode: "all" | "by_color";
    selectedColor?: string;
}

export default function ExportPreview({ samples, separator, hasHeader, decimalSeparator, mode, selectedColor }: ExportPreviewProps) {
    const previewContent = useMemo(() => {
        let filtered = samples;
        if (mode === "by_color" && selectedColor) {
            filtered = samples.filter(s => s.cor === selectedColor);
        }

        const headers = ["MIC", "LEN", "UNF", "STR", "RD", "+b"];
        const sep = separator === "tab" ? "\t" : separator;

        let lines: string[] = [];
        if (hasHeader) {
            lines.push(headers.join(sep));
        }

        filtered.forEach(s => {
            // MIC e LEN: 2 decimais, UNF/RD/+b: 1 decimal, STR: inteiro
            const row = [
                s.mic?.toFixed(2),
                s.len?.toFixed(2),
                s.unf?.toFixed(1),
                s.str?.toFixed(1),
                s.rd?.toFixed(1),
                s.b?.toFixed(1)
            ].map(val => {
                if (val === undefined || val === null) return "";
                let str = val.toString();
                if (decimalSeparator === ",") str = str.replace(".", ",");
                return str;
            });
            lines.push(row.join(sep));
        });

        return lines.join("\n");
    }, [samples, separator, hasHeader, decimalSeparator, mode, selectedColor]);

    return (
        <Card className="border-none shadow-2xl rounded-3xl overflow-hidden ring-1 ring-slate-800">
            <CardContent className="p-8 bg-slate-950 text-emerald-400 font-mono text-xs overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed">
                <div className="flex items-center gap-2 mb-4 text-slate-500 border-b border-white/5 pb-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="ml-2 text-[10px] font-black uppercase tracking-widest italic opacity-50">data_output_terminal</span>
                </div>
                {previewContent || "// Aguardando dados para exportação..."}
            </CardContent>
        </Card>
    );
}
