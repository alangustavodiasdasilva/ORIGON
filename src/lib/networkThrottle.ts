// Injeta um atraso real em toda requisição de rede (fetch — usado por baixo
// dos panos pelo cliente do Supabase) enquanto ativo. Usado só pra simular
// lentidão num laboratório específico a pedido do Alan — nunca aplicado
// na sessão dele mesmo (ver AuthContext.tsx, que chama enable/disable
// checando o user.id antes). Intensidade "tipo volume" — o atraso em ms
// vem de fora (lab_throttle.delay_ms), 0 = desligado.
let originalFetch: typeof window.fetch | null = null;
let currentDelayMs = 0;

export function enableNetworkThrottle(delayMs: number): void {
    if (delayMs <= 0) {
        disableNetworkThrottle();
        return;
    }
    currentDelayMs = delayMs;
    if (originalFetch) return; // já patchado — só atualiza o delay usado

    originalFetch = window.fetch.bind(window);
    window.fetch = ((...args: Parameters<typeof fetch>) => {
        return new Promise<Response>((resolve, reject) => {
            setTimeout(() => {
                originalFetch!(...args).then(resolve, reject);
            }, currentDelayMs);
        });
    }) as typeof fetch;
}

export function disableNetworkThrottle(): void {
    currentDelayMs = 0;
    if (!originalFetch) return;
    window.fetch = originalFetch;
    originalFetch = null;
}

export function isNetworkThrottleActive(): boolean {
    return currentDelayMs > 0;
}
