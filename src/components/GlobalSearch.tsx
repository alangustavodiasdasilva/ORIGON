import { useState, useEffect, useCallback } from 'react';
import { Search, X, Filter, Building2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LoteService } from '@/entities/Lote';
import { SampleService } from '@/entities/Sample';
import { LabService } from '@/entities/Lab';
import { AuditService } from '@/entities/Audit';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface SearchResult {
    id: string;
    type: 'lote' | 'sample' | 'document' | 'lab';
    title: string;
    subtitle: string;
    url: string;
    metadata?: Record<string, any>;
}

export default function GlobalSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const navigate = useNavigate();
    const { t } = useLanguage();

    // Keyboard shortcut: Ctrl+K or Cmd+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Navigate results with keyboard
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && results[selectedIndex]) {
                e.preventDefault();
                navigate(results[selectedIndex].url);
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex, navigate]);

    // Search function
    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        const lowerQuery = searchQuery.toLowerCase();
        const searchResults: SearchResult[] = [];

        try {
            // Search lotes
            const lotes = await LoteService.list();
            lotes.forEach(lote => {
                if (
                    lote.nome.toLowerCase().includes(lowerQuery) ||
                    lote.id.toLowerCase().includes(lowerQuery) ||
                    lote.cidade?.toLowerCase().includes(lowerQuery)
                ) {
                    searchResults.push({
                        id: lote.id,
                        type: 'lote',
                        title: lote.nome,
                        subtitle: `Lote • ${lote.cidade || 'N/A'} • ${new Date(lote.created_at).toLocaleDateString()}`,
                        url: `/registro?loteId=${lote.id}`
                    });
                }
            });

            // Search samples
            const samples = await SampleService.list();
            samples.forEach(sample => {
                if (
                    sample.id.toLowerCase().includes(lowerQuery) ||
                    sample.lote_id.toLowerCase().includes(lowerQuery)
                ) {
                    searchResults.push({
                        id: sample.id,
                        type: 'sample',
                        title: `${t('search.sample')} ${sample.id.substring(0, 8)}...`,
                        subtitle: `${t('search.sample')} • ${t('search.batch')} ${sample.lote_id.substring(0, 8)}...`,
                        url: `/registro?loteId=${sample.lote_id}`
                    });
                }
            });

            // Search labs
            const labs = await LabService.list();
            labs.forEach(lab => {
                if (
                    lab.nome.toLowerCase().includes(lowerQuery) ||
                    lab.codigo.toLowerCase().includes(lowerQuery) ||
                    lab.cidade?.toLowerCase().includes(lowerQuery)
                ) {
                    searchResults.push({
                        id: lab.id,
                        type: 'lab',
                        title: lab.nome,
                        subtitle: `${t('search.lab')} • ${lab.cidade || 'N/A'} • ${lab.codigo}`,
                        url: `/admin`
                    });
                }
            });

            // Search audit documents
            const docs = await AuditService.list();
            docs.forEach(doc => {
                if (
                    doc.fileName.toLowerCase().includes(lowerQuery) ||
                    doc.name.toLowerCase().includes(lowerQuery) ||
                    doc.category.toLowerCase().includes(lowerQuery)
                ) {
                    searchResults.push({
                        id: doc.id,
                        type: 'document',
                        title: doc.fileName,
                        subtitle: `${t('search.document')} • ${doc.category} • ${new Date(doc.uploadDate).toLocaleDateString()}`,
                        url: `/quality`
                    });
                }
            });

            setResults(searchResults.slice(0, 50)); // Limit to 50 results
            setSelectedIndex(0);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            performSearch(query);
        }, 300);

        return () => clearTimeout(timer);
    }, [query, performSearch]);

    const getIcon = (type: SearchResult['type']) => {
        switch (type) {
            case 'lote': return <FileText className="h-4 w-4" />;
            case 'sample': return <Filter className="h-4 w-4" />;
            case 'lab': return <Building2 className="h-4 w-4" />;
            case 'document': return <FileText className="h-4 w-4" />;
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors"
            >
                <Search className="h-4 w-4" />
                <span>{t('common.search')}</span>
                <kbd className="hidden md:inline-block px-2 py-1 text-xs font-mono bg-neutral-100 border border-neutral-200 rounded">
                    Ctrl+K
                </kbd>
            </button>
        );
    }

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 z-50 animate-fade-in"
                onClick={() => setIsOpen(false)}
            />

            {/* Search Modal */}
            <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 animate-slide-down">
                <div className="bg-white border-2 border-black shadow-2xl mx-4">
                    {/* Search Input */}
                    <div className="p-4 border-b border-neutral-200 flex items-center gap-3">
                        <Search className="h-5 w-5 text-neutral-400" />
                        <Input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('search.placeholder')}
                            className="flex-1 border-0 focus-visible:ring-0 text-base placeholder:text-neutral-400"
                        />
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-neutral-400 hover:text-black"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Results */}
                    <div className="max-h-[500px] overflow-y-auto">
                        {isSearching ? (
                            <div className="p-8 text-center text-neutral-400">
                                <div className="animate-spin mx-auto h-8 w-8 border-2 border-black border-t-transparent rounded-full mb-4" />
                                <p className="text-sm">{t('search.searching')}</p>
                            </div>
                        ) : results.length === 0 && query ? (
                            <div className="p-8 text-center text-neutral-400">
                                <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                <p className="text-sm">{t('search.no_results')}</p>
                                <p className="text-xs mt-2">{t('search.try_search')}</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="p-8 text-center text-neutral-400">
                                <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                <p className="text-sm">{t('search.type_to_search')}</p>
                                <p className="text-xs mt-2 font-mono">{t('search.instructions')}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-neutral-100">
                                {results.map((result, index) => (
                                    <button
                                        key={result.id}
                                        onClick={() => {
                                            navigate(result.url);
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            "w-full p-4 flex items-center gap-4 hover:bg-neutral-50 transition-colors text-left",
                                            index === selectedIndex && "bg-blue-50 border-l-4 border-black"
                                        )}
                                    >
                                        <div className="h-10 w-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600">
                                            {getIcon(result.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-sm truncate">{result.title}</h4>
                                            <p className="text-xs text-neutral-500 truncate">{result.subtitle}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500 font-mono">
                        <span>{t('search.navigate')}</span>
                        <span>{results.length} {results.length !== 1 ? t('search.results') : t('search.result')}</span>
                    </div>
                </div>
            </div>
        </>
    );
}
