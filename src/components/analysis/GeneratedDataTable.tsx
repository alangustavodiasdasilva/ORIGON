import { useMemo } from 'react';
import type { Sample } from '@/entities/Sample';

interface GeneratedDataTableProps {
    samples: Sample[];
}

export default function GeneratedDataTable({ samples }: GeneratedDataTableProps) {
    const tableRows = useMemo(() => {
        const rows: any[] = [];

        samples.forEach(sample => {
            if (!sample.leituras_geradas || !Array.isArray(sample.leituras_geradas) || sample.leituras_geradas.length === 0) {
                return;
            }

            // Calculamos os offsets de tempo determinísticos da mesma forma que o gerador de HVI
            let tHash = 0;
            const tSeedStr = `${sample.id || sample.amostra_id || "time"}_time`;
            for (let i = 0; i < tSeedStr.length; i++) {
                tHash = (tHash << 5) - tHash + tSeedStr.charCodeAt(i);
                tHash |= 0;
            }
            let tSeed = Math.abs(tHash) || 1;
            const tRand = () => {
                tSeed ^= tSeed << 13;
                tSeed ^= tSeed >>> 17;
                tSeed ^= tSeed << 5;
                return (Math.abs(tSeed) % 1000000) / 1000000;
            };

            const count = sample.leituras_geradas.length;
            const offsets = [0];
            let currentOffset = 0;
            for (let j = 1; j < count; j++) {
                currentOffset += (1 + Math.floor(tRand() * 2)); // 1 ou 2 min
                offsets.push(currentOffset);
            }

            // Data/Hora base da amostra
            let baseDate = sample.data_analise; // DD/MM/YYYY
            if (!baseDate) {
                const now = new Date();
                baseDate = now.toLocaleDateString('pt-BR');
            }
            let baseHours = 0;
            let baseMinutes = 0;
            if (sample.hora_analise) {
                const parts = sample.hora_analise.split(':');
                if (parts.length >= 2) {
                    baseHours = parseInt(parts[0], 10);
                    baseMinutes = parseInt(parts[1], 10);
                }
            } else {
                const now = new Date();
                baseHours = now.getHours();
                baseMinutes = now.getMinutes();
            }

            sample.leituras_geradas.forEach((leitura, index) => {
                // Time
                const offsetMin = offsets[index] || 0;
                const repMinutes = baseMinutes + offsetMin;
                const repHour = (baseHours + Math.floor(repMinutes / 60)) % 24;
                const repMin = repMinutes % 60;
                const timeStr = `${String(repHour).padStart(2, '0')}:${String(repMin).padStart(2, '0')}`;
                
                rows.push({
                    id: `${sample.id}-${index}`,
                    etiqueta: sample.etiqueta || sample.amostra_id,
                    mala: sample.mala || '',
                    mic: leitura.mic,
                    len: leitura.len,
                    unf: leitura.unf,
                    str: leitura.str,
                    elg: leitura.elg,
                    rd: leitura.rd,
                    b: leitura.b,
                    cg: leitura.cg,
                    leaf: leitura.leaf,
                    area: leitura.area,
                    count: leitura.count,
                    csp: leitura.csp,
                    sci: leitura.sci,
                    mat: leitura.mat,
                    sfi: leitura.sfi,
                    hvi: sample.hvi || '1',
                    dataHora: `${baseDate} ${timeStr}`
                });
            });
        });

        return rows;
    }, [samples]);

    if (tableRows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-white rounded-lg border border-slate-200">
                <p>Nenhum dado gerado salvo.</p>
                <p className="text-sm">Confirme e baixe os arquivos HVI para que os dados apareçam aqui.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                    <tr>
                        <th className="p-2 border-r border-slate-200 min-w-[150px]">Etiqueta</th>
                        <th className="p-2 border-r border-slate-200 min-w-[100px]">Mala</th>
                        <th className="p-2 border-r border-slate-200">Mic</th>
                        <th className="p-2 border-r border-slate-200">Len</th>
                        <th className="p-2 border-r border-slate-200">Unf</th>
                        <th className="p-2 border-r border-slate-200">Str</th>
                        <th className="p-2 border-r border-slate-200">Elg</th>
                        <th className="p-2 border-r border-slate-200">Rd</th>
                        <th className="p-2 border-r border-slate-200">+b</th>
                        <th className="p-2 border-r border-slate-200">CG</th>
                        <th className="p-2 border-r border-slate-200">Leaf</th>
                        <th className="p-2 border-r border-slate-200">Area</th>
                        <th className="p-2 border-r border-slate-200">Count</th>
                        <th className="p-2 border-r border-slate-200">CSP</th>
                        <th className="p-2 border-r border-slate-200">SCI</th>
                        <th className="p-2 border-r border-slate-200">Mat</th>
                        <th className="p-2 border-r border-slate-200">SFI</th>
                        <th className="p-2 border-r border-slate-200">HVI</th>
                        <th className="p-2 min-w-[130px]">Data/Hora</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {tableRows.map((row) => (
                        <tr key={row.id} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-2 border-r border-slate-100">{row.etiqueta}</td>
                            <td className="p-2 border-r border-slate-100">{row.mala}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.mic).toFixed(2).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.len).toFixed(2).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.unf).toFixed(1).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.str).toFixed(1).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.elg).toFixed(1).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.rd).toFixed(1).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.b).toFixed(1).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-center">{row.cg}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{row.leaf}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.area).toFixed(2).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{row.count}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{row.csp}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{row.sci}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.mat).toFixed(2).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-right">{Number(row.sfi).toFixed(1).replace('.', ',')}</td>
                            <td className="p-2 border-r border-slate-100 text-center">{row.hvi}</td>
                            <td className="p-2 text-slate-500 whitespace-nowrap">{row.dataHora}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
