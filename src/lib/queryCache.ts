/**
 * queryCache.ts — Cache SWR (Stale-While-Revalidate) em memória
 *
 * Estratégia:
 *  1. Na primeira chamada: busca os dados, armazena em cache e retorna.
 *  2. Nas chamadas seguintes (dentro do TTL): retorna o cache IMEDIATAMENTE.
 *  3. Após o TTL expirar: retorna o cache antigo (stale) IMEDIATAMENTE e
 *     dispara uma revalidação em background. O usuário nunca espera.
 *
 * Não altera nenhuma interface pública dos serviços — é apenas uma
 * camada de cache transparente.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    revalidating: boolean;
}

const store = new Map<string, CacheEntry<unknown>>();

// TTL padrão: 45 segundos — dados ficam "frescos" por este período
const DEFAULT_TTL_MS = 45_000;

/**
 * Busca dados com cache SWR.
 *
 * @param key        Chave única para o cache (ex: "producao:labId123")
 * @param fetcher    Função assíncrona que busca os dados reais
 * @param ttl        Tempo de vida do cache em ms (padrão: 45s)
 */
export async function cachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = DEFAULT_TTL_MS,
): Promise<T> {
    const now = Date.now();
    const entry = store.get(key) as CacheEntry<T> | undefined;

    // Cache existe e ainda está dentro do TTL → retorna IMEDIATAMENTE
    if (entry && now - entry.timestamp < ttl) {
        return entry.data;
    }

    // Cache existe mas está expirado (stale) →
    // retorna os dados antigos IMEDIATAMENTE e revalida em background
    if (entry && !entry.revalidating) {
        entry.revalidating = true;
        // Revalida sem bloquear o chamador
        fetcher().then((fresh) => {
            store.set(key, { data: fresh, timestamp: Date.now(), revalidating: false });
        }).catch(() => {
            // Se a revalidação falhar, mantém o cache antigo e libera a flag
            if (store.has(key)) {
                (store.get(key) as CacheEntry<T>).revalidating = false;
            }
        });
        return entry.data; // retorna stale data imediatamente
    }

    // Sem cache nenhum → busca os dados e aguarda (primeira chamada)
    const data = await fetcher();
    store.set(key, { data, timestamp: Date.now(), revalidating: false });
    return data;
}

/**
 * Invalida uma entrada específica do cache.
 * Use após operações de escrita (upload, delete) para forçar refetch.
 */
export function invalidateCache(key: string): void {
    store.delete(key);
}

/**
 * Invalida todas as entradas de cache que começam com um prefixo.
 * Ex: invalidateCachePrefix("producao:") invalida todos os labs.
 */
export function invalidateCachePrefix(prefix: string): void {
    for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
            store.delete(k);
        }
    }
}

/**
 * Limpa todo o cache em memória.
 * Útil no logout ou ao trocar de laboratório.
 */
export function clearAllCache(): void {
    store.clear();
}

/**
 * Retorna o valor em cache sem disparar fetch (leitura síncrona).
 * Retorna undefined se não houver cache.
 */
export function peekCache<T>(key: string): T | undefined {
    return (store.get(key) as CacheEntry<T> | undefined)?.data;
}
