import React, { useState, useEffect, useMemo } from 'react';

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

const DECIMALS: Record<string, number> = {
    mic: 2, len: 2, unf: 1, str: 1, elg: 1, rd: 1, b: 1, leaf: 0, area: 2, count: 0, mat: 2, sfi: 1
};

/** Média e desvio padrão amostral (n-1) dos valores numéricos de uma coluna gerada. */
function computeStats(values: any[]): { mean: number; std: number } {
    const nums = (values || []).map(Number).filter(v => !isNaN(v));
    if (nums.length === 0) return { mean: 0, std: 0 };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    if (nums.length < 2) return { mean, std: 0 };
    const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1);
    return { mean, std: Math.sqrt(variance) };
}

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
    onMove: (dir: 'up' | 'down' | 'left' | 'right', ownerDoc: Document) => void
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
        const ownerDoc = e.currentTarget.ownerDocument;
        if (e.key === 'Enter') {
            handleBlur();
            onMove('down', ownerDoc);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            handleBlur();
            onMove('up', ownerDoc);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            handleBlur();
            onMove('down', ownerDoc);
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            handleBlur();
            onMove('left', ownerDoc);
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            handleBlur();
            onMove('right', ownerDoc);
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
            className="w-full h-full p-2 outline-none focus:bg-blue-100 focus:ring-inset focus:ring-2 focus:ring-blue-500 bg-transparent text-center font-mono text-sm min-w-[65px]"
        />
    );
}

export default function ReanaliseDataTable({ gridData, labels, machineName, onChange }: ReanaliseDataTableProps) {
    const [sortCol, setSortCol] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const rowCount = gridData?.mic?.length ?? 0;

    // Ordem de exibição das linhas: por padrão a original, ou reordenada pelo
    // parâmetro clicado (menor pro maior, e vice-versa clicando de novo).
    // Guarda os ÍNDICES originais — os dados em si (gridData) não são tocados.
    const order = useMemo(() => {
        const indices = Array.from({ length: rowCount }, (_, i) => i);
        if (!sortCol || !gridData) return indices;
        const values = gridData[sortCol] || [];
        return indices.slice().sort((a, b) => {
            const va = Number(values[a]);
            const vb = Number(values[b]);
            const aInvalid = isNaN(va);
            const bInvalid = isNaN(vb);
            if (aInvalid && bInvalid) return 0;
            if (aInvalid) return 1;
            if (bInvalid) return -1;
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [gridData, sortCol, sortDir, rowCount]);

    if (!gridData || !gridData.mic || gridData.mic.length === 0) {
        return null;
    }

    const toggleSort = (col: typeof COLUMNS[0]) => {
        if (col.isText) return;
        if (sortCol === col.key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortCol(col.key);
            setSortDir('asc');
        }
    };

    // Usa o ownerDocument do campo de origem — dentro do PiP, os campos vivem no
    // document da janela flutuante, não no document da página principal.
    // Navega pela ORDEM EXIBIDA (que pode estar ordenada por algum parâmetro),
    // não pelo índice original dos dados.
    const handleMove = (displayPos: number, colIndex: number, dir: 'up' | 'down' | 'left' | 'right', ownerDoc: Document) => {
        let nextDisplayPos = displayPos;
        let nextCol = colIndex;

        if (dir === 'up') nextDisplayPos = displayPos - 1;
        if (dir === 'down') nextDisplayPos = displayPos + 1;
        if (dir === 'left') nextCol = colIndex - 1;
        if (dir === 'right') nextCol = colIndex + 1;

        if (nextDisplayPos >= 0 && nextDisplayPos < order.length && nextCol >= 0 && nextCol < COLUMNS.length) {
            const nextRowIndex = order[nextDisplayPos];
            const nextField = ownerDoc.getElementById(`grid-cell-${nextRowIndex}-${COLUMNS[nextCol].key}`);
            if (nextField) {
                (nextField as HTMLInputElement).focus();
            }
        }
    };

    return (
        <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm pb-1">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-bold text-slate-700">
                    Visualização de Dados Gerados (Editável)
                </h3>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    Clique num parâmetro pra ordenar (menor → maior)
                </span>
            </div>
            <table className="w-full text-sm text-left border-collapse min-w-[1000px]">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                    <tr>
                        <th className="p-2 border-r border-slate-200 w-12 text-center">Nº</th>
                        <th className="p-2 border-r border-slate-200 min-w-[150px]">Fardo</th>
                        {COLUMNS.map(col => (
                            <th key={col.key} className="p-0 border-r border-slate-200 text-center">
                                <button
                                    type="button"
                                    disabled={col.isText}
                                    onClick={() => toggleSort(col)}
                                    title={col.isText ? undefined : `Ordenar por ${col.label}`}
                                    className={`w-full h-full p-2 transition-colors flex items-center justify-center gap-1 ${col.isText ? 'cursor-default' : 'cursor-pointer hover:bg-blue-100'} ${
                                        sortCol === col.key ? 'bg-blue-200 text-blue-900' : ''
                                    }`}
                                >
                                    {col.label}
                                    {sortCol === col.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                                </button>
                            </th>
                        ))}
                        <th className="p-2 border-r border-slate-200 text-center">Maq</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {order.map((rowIndex, displayPos) => (
                        <tr key={rowIndex} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500 font-mono">{displayPos + 1}</td>
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
                                            onMove={(dir, ownerDoc) => handleMove(displayPos, colIndex, dir, ownerDoc)}
                                        />
                                    </td>
                                );
                            })}
                            <td className="p-2 border-r border-slate-100 text-center text-slate-500 font-bold">{machineName}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                    <tr>
                        <td className="p-2 border-r border-slate-200 text-slate-600" colSpan={2}>Média</td>
                        {COLUMNS.map(col => (
                            <td key={col.key} className="p-2 border-r border-slate-200 text-center font-mono text-slate-700">
                                {col.isText ? '—' : computeStats(gridData[col.key]).mean.toFixed(DECIMALS[col.key] ?? 2)}
                            </td>
                        ))}
                        <td className="p-2 border-r border-slate-200"></td>
                    </tr>
                    <tr>
                        <td className="p-2 border-r border-slate-200 text-slate-600" colSpan={2}>Desvio Padrão</td>
                        {COLUMNS.map(col => (
                            <td key={col.key} className="p-2 border-r border-slate-200 text-center font-mono text-blue-700">
                                {col.isText ? '—' : computeStats(gridData[col.key]).std.toFixed(DECIMALS[col.key] ?? 2)}
                            </td>
                        ))}
                        <td className="p-2 border-r border-slate-200"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
