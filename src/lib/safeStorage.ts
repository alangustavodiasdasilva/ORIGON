/**
 * Grava no localStorage sem derrubar a aplicação quando a cota estoura
 * (QuotaExceededError). O localStorage é sempre um cache/fallback aqui —
 * o Supabase é a fonte de verdade — então uma falha de gravação deve
 * apenas ser ignorada (com aviso no console), nunca virar uma exceção
 * não tratada que o ErrorBoundary transforma em tela de erro pro usuário.
 */
export function safeSetItem(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn(`Falha ao gravar '${key}' no localStorage (provavelmente quota excedida):`, e);
        return false;
    }
}
