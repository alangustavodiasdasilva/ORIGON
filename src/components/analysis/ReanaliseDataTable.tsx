import React from 'react';

const LIMITS = {
    mic: { min: 3.5, max: 4.9 },
    len: { min: 27.4, max: 31.9 },
    unf: { min: 78, max: 85 },
    str: { min: 27.4, max: 33.9 },
    elg: { min: 5, max: 7.5 },
    rd: { min: 77, max: 85 },
    b: { min: 5.0, max: 13.0 },
    sfi: { min: 7.5, max: 12.0 },
    leaf: { min: 1, max: 7 }
};

interface ReanaliseDataTableProps {
    gridData: Record<string, any[]>;
    labels: string[];
    machineId: string;
    onChange: (index: number, key: string, value: any) => void;
}

const COLUMNS = [
    { key: 'mic', label: 'Mic', step: '0.01', limitInfo: LIMITS.mic },
    { key: 'len', label: 'Len', step: '0.01', limitInfo: LIMITS.len },
    { key: 'unf', label: 'Unf', step: '0.1', limitInfo: LIMITS.unf },
    { key: 'str', label: 'Str', step: '0.1', limitInfo: LIMITS.str },
    { key: 'elg', label: 'Elg', step: '0.1', limitInfo: LIMITS.elg },
    { key: 'rd', label: 'Rd', step: '0.1', limitInfo: LIMITS.rd },
    { key: 'b', label: '+b', step: '0.1', limitInfo: LIMITS.b },
    { key: 'cg', label: 'CG', step: '', isText: true },
    { key: 'leaf', label: 'Leaf', step: '1', limitInfo: LIMITS.leaf },
    { key: 'area', label: 'Area', step: '0.01' },
    { key: 'count', label: 'Count', step: '1' },
    { key: 'mat', label: 'Mat', step: '0.01' },
    { key: 'sfi', label: 'SFI', step: '0.1', limitInfo: LIMITS.sfi }
];

export default function ReanaliseDataTable({ gridData, labels, machineId, onChange }: ReanaliseDataTableProps) {
    if (!gridData || !gridData.mic || gridData.mic.length === 0) {
        return null;
    }

    const rowCount = gridData.mic.length;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
        let targetRow = rowIndex;
        let targetCol = colIndex;

        if (e.key === 'ArrowUp') {
            targetRow -= 1;
            e.preventDefault();
        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
            targetRow += 1;
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            targetCol -= 1;
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            targetCol += 1;
            e.preventDefault();
        }

        if (targetRow >= 0 && targetRow < rowCount && targetCol >= 0 && targetCol < COLUMNS.length) {
            const nextField = document.getElementById(`grid-cell-${targetRow}-${COLUMNS[targetCol].key}`);
            if (nextField) {
                (nextField as HTMLInputElement).focus();
            }
        }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>, rowIndex: number, col: typeof COLUMNS[0]) => {
        if (col.isText) return;
        const val = parseFloat(e.target.value.replace(',', '.'));
        if (isNaN(val)) return;

        if (col.limitInfo) {
            if (val < col.limitInfo.min || val > col.limitInfo.max) {
                alert(`Valor ${val} inválido para ${col.label.toUpperCase()}. O limite aceito é entre ${col.limitInfo.min} e ${col.limitInfo.max}.`);
                // Volta pro valor anterior (ele é recarregado do gridData pq o React vai re-renderizar)
                onChange(rowIndex, col.key, gridData[col.key][rowIndex]);
                e.target.focus();
                return;
            }
        }
    };

    return (
        <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm pb-1">
            <h3 className="p-3 bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                Visualização de Dados Gerados (Editável)
            </h3>
            <table className="w-full text-xs text-left border-collapse" style={{ minWidth: '900px' }}>
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                    <tr>
                        <th className="p-2 border-r border-slate-200 w-12 text-center">Nº</th>
                        <th className="p-2 border-r border-slate-200 min-w-[150px]">Fardo</th>
                        <th className="p-2 border-r border-slate-200 text-center">Padrão</th>
                        {COLUMNS.map(col => (
                            <th key={col.key} className="p-2 border-r border-slate-200 text-center">{col.label}</th>
                        ))}
                        <th className="p-2 border-r border-slate-200 text-center">Moist.</th>
                        <th className="p-2 border-r border-slate-200 text-center">Maq</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {Array.from({ length: rowCount }).map((_, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500 font-mono">{rowIndex + 1}</td>
                            <td className="p-2 border-r border-slate-100 font-mono text-blue-700">{labels[rowIndex]}</td>
                            <td className="p-2 border-r border-slate-100 text-center text-slate-400">-</td>
                            {COLUMNS.map((col, colIndex) => {
                                const val = gridData[col.key] ? gridData[col.key][rowIndex] : '';
                                return (
                                    <td key={col.key} className="p-0 border-r border-slate-100">
                                        <input
                                            id={`grid-cell-${rowIndex}-${col.key}`}
                                            type={col.isText ? "text" : "number"}
                                            step={col.step}
                                            value={val === undefined ? '' : val}
                                            onChange={(e) => {
                                                const newVal = col.isText ? e.target.value : (e.target.value === '' ? '' : parseFloat(e.target.value.replace(',', '.')));
                                                onChange(rowIndex, col.key, newVal);
                                            }}
                                            onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                                            onBlur={(e) => handleBlur(e, rowIndex, col)}
                                            className="w-full h-full p-2 outline-none focus:bg-blue-100 focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent text-right font-mono"
                                            style={{ minWidth: '60px' }}
                                        />
                                    </td>
                                );
                            })}
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500">0</td>
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500">{machineId}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
