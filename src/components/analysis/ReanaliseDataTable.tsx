import React, { useState, useEffect } from 'react';

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
    machineName: string;
    onChange: (index: number, key: string, value: any) => void;
}

const COLUMNS = [
    { key: 'len', label: 'Len' },
    { key: 'unf', label: 'Unf' },
    { key: 'str', label: 'Str' },
    { key: 'elg', label: 'Elg' },
    { key: 'mic', label: 'Mic' },
    { key: 'rd', label: 'Rd' },
    { key: 'b', label: '+b' },
    { key: 'cg', label: 'CG', isText: true },
    { key: 'sfi', label: 'SFI' },
    { key: 'leaf', label: 'Leaf' },
    { key: 'count', label: 'Count' },
    { key: 'area', label: 'Area' },
    { key: 'mat', label: 'Mat' }
];

function CellInput({
    value,
    rowIndex,
    colIndex,
    col,
    onChange,
    onMove
}: {
    value: any,
    rowIndex: number,
    colIndex: number,
    col: typeof COLUMNS[0],
    onChange: (val: any) => void,
    onMove: (dir: 'up' | 'down') => void
}) {
    const [localVal, setLocalVal] = useState(value === undefined ? '' : String(value));

    // Sync from props se mudar via generate externo
    useEffect(() => {
        setLocalVal(value === undefined ? '' : String(value));
    }, [value]);

    const handleBlur = () => {
        if (col.isText) {
            onChange(localVal);
            return;
        }

        const parsed = parseFloat(localVal.replace(',', '.'));
        if (isNaN(parsed)) {
            setLocalVal(value === undefined ? '' : String(value));
            return;
        }

        const limits = (LIMITS as any)[col.key];
        if (limits) {
            if (parsed < limits.min || parsed > limits.max) {
                alert(`Valor ${parsed} inválido para ${col.label.toUpperCase()}. O limite aceito é entre ${limits.min} e ${limits.max}.`);
                setLocalVal(String(value)); // Reset to valid
                return;
            }
        }
        onChange(parsed);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleBlur();
            onMove('down');
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            handleBlur();
            onMove('up');
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            handleBlur();
            onMove('down');
            e.preventDefault();
        }
    };

    return (
        <input
            id={`grid-cell-${rowIndex}-${col.key}`}
            type="text"
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="w-full h-full p-2 outline-none focus:bg-blue-100 focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent text-center font-mono"
            style={{ minWidth: '60px' }}
        />
    );
}

export default function ReanaliseDataTable({ gridData, labels, machineName, onChange }: ReanaliseDataTableProps) {
    if (!gridData || !gridData.mic || gridData.mic.length === 0) {
        return null;
    }

    const rowCount = gridData.mic.length;

    const handleMove = (rowIndex: number, colIndex: number, dir: 'up' | 'down') => {
        const nextRow = dir === 'up' ? rowIndex - 1 : rowIndex + 1;
        if (nextRow >= 0 && nextRow < rowCount) {
            const nextField = document.getElementById(`grid-cell-${nextRow}-${COLUMNS[colIndex].key}`);
            if (nextField) {
                (nextField as HTMLInputElement).focus();
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
                        {COLUMNS.map(col => (
                            <th key={col.key} className="p-2 border-r border-slate-200 text-center">{col.label}</th>
                        ))}
                        <th className="p-2 border-r border-slate-200 text-center">Maq</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {Array.from({ length: rowCount }).map((_, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500 font-mono">{rowIndex + 1}</td>
                            <td className="p-2 border-r border-slate-100 font-mono text-blue-700">{labels[rowIndex]}</td>
                            {COLUMNS.map((col, colIndex) => {
                                const val = gridData[col.key] ? gridData[col.key][rowIndex] : '';
                                return (
                                    <td key={col.key} className="p-0 border-r border-slate-100">
                                        <CellInput
                                            value={val}
                                            rowIndex={rowIndex}
                                            colIndex={colIndex}
                                            col={col}
                                            onChange={(newVal) => onChange(rowIndex, col.key, newVal)}
                                            onMove={(dir) => handleMove(rowIndex, colIndex, dir)}
                                        />
                                    </td>
                                );
                            })}
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500 font-bold">{machineName}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
