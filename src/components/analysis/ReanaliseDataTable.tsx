import React, { useState, useEffect } from 'react';

function sanitize(val: number, type: string): number {
    if (isNaN(val) || val === 0) return 0;
    switch (type) {
        case 'mic':
            if (val >= 20 && val <= 99) return val / 10;
            if (val >= 200 && val <= 999) return val / 100;
            if (val >= 2 && val <= 9.9) return val;
            break;
        case 'len':
            if (val >= 200 && val <= 450) return val / 10;
            if (val >= 2000 && val <= 4500) return val / 100;
            if (val >= 20 && val <= 45) return val;
            break;
        case 'unf':
            if (val >= 500 && val <= 950) return val / 10;
            if (val >= 5000 && val <= 9500) return val / 100;
            if (val >= 50 && val <= 95) return val;
            break;
        case 'str':
            if (val >= 100 && val <= 500) return val / 10;
            if (val >= 1000 && val <= 5000) return val / 100;
            if (val >= 10 && val <= 50) return val;
            break;
        case 'elg':
            if (val >= 30 && val <= 150) return val / 10;
            if (val >= 300 && val <= 1500) return val / 100;
            if (val >= 3 && val <= 15) return val;
            break;
        case 'rd':
            if (val >= 400 && val <= 900) return val / 10;
            if (val >= 4000 && val <= 9000) return val / 100;
            if (val >= 40 && val <= 90) return val;
            break;
        case 'b':
            if (val >= 40 && val <= 200) return val / 10;
            if (val >= 400 && val <= 2000) return val / 100;
            if (val >= 4 && val <= 20) return val;
            break;
        case 'area':
            if (val >= 1 && val <= 200) return val / 100;
            if (val > 0 && val < 5) return val;
            break;
        case 'mat':
            if (val >= 70 && val <= 100) return val / 100;
            if (val >= 700 && val <= 1000) return val / 1000;
            if (val > 0.60 && val <= 1.0) return val;
            break;
        case 'sfi':
            if (val >= 30 && val <= 200) return val / 10;
            if (val >= 300 && val <= 2000) return val / 100;
            if (val >= 3 && val <= 20) return val;
            break;
        default: return val;
    }
    return val;
}

interface ReanaliseDataTableProps {
    gridData: Record<string, any[]>;
    labels: string[];
    machineName: string;
    onChange: (index: number, key: string, value: any) => void;
}

const COLUMNS = [
    { key: 'mic', label: 'Mic' },
    { key: 'len', label: 'Len' },
    { key: 'unf', label: 'Unf' },
    { key: 'str', label: 'Str' },
    { key: 'elg', label: 'Elg' },
    { key: 'rd', label: 'Rd' },
    { key: 'b', label: '+b' },
    { key: 'cg', label: 'CG', isText: true },
    { key: 'leaf', label: 'Leaf' },
    { key: 'area', label: 'Area' },
    { key: 'count', label: 'Count' },
    { key: 'mat', label: 'Mat' },
    { key: 'sfi', label: 'SFI' }
];

function CellInput({
    value,
    rowIndex,
    col,
    onChange,
    onMove
}: {
    value: any,
    rowIndex: number,
    col: typeof COLUMNS[0],
    onChange: (val: any) => void,
    onMove: (dir: 'up' | 'down' | 'left' | 'right') => void
}) {
    const [localVal, setLocalVal] = useState(value === undefined ? '' : String(value));

    useEffect(() => {
        setLocalVal(value === undefined ? '' : String(value));
    }, [value]);

    const handleBlur = () => {
        if (col.isText) {
            onChange(localVal);
            return;
        }

        let parsed = parseFloat(localVal.replace(',', '.'));
        if (isNaN(parsed)) {
            setLocalVal(value === undefined ? '' : String(value));
            return;
        }

        // Auto format (sanitize) the input value
        parsed = sanitize(parsed, col.key);

        // Update display to match the sanitized value
        setLocalVal(String(parsed));
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
        } else if (e.key === 'ArrowLeft') {
            handleBlur();
            onMove('left');
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            handleBlur();
            onMove('right');
            e.preventDefault();
        }
    };

    return (
        <input
            id={`grid-cell-${rowIndex}-${col.key}`}
            type="text"
            title={col.label}
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={(e) => e.target.select()}
            className="w-full h-full p-2 outline-none focus:bg-blue-100 focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent text-center font-mono text-sm"
            style={{ minWidth: '65px' }}
        />
    );
}

export default function ReanaliseDataTable({ gridData, labels, machineName, onChange }: ReanaliseDataTableProps) {
    if (!gridData || !gridData.mic || gridData.mic.length === 0) {
        return null;
    }

    const rowCount = gridData.mic.length;

    const handleMove = (rowIndex: number, colIndex: number, dir: 'up' | 'down' | 'left' | 'right') => {
        let nextRow = rowIndex;
        let nextCol = colIndex;

        if (dir === 'up') nextRow = rowIndex - 1;
        if (dir === 'down') nextRow = rowIndex + 1;
        if (dir === 'left') nextCol = colIndex - 1;
        if (dir === 'right') nextCol = colIndex + 1;

        if (nextRow >= 0 && nextRow < rowCount && nextCol >= 0 && nextCol < COLUMNS.length) {
            const nextField = document.getElementById(`grid-cell-${nextRow}-${COLUMNS[nextCol].key}`);
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
            <table className="w-full text-sm text-left border-collapse" style={{ minWidth: '1000px' }}>
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
