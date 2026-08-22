// SHA-256 hex do lado do navegador — mesmo algoritmo usado em todo o sistema
// (login, troca de senha, cadastro de analista) desde sempre, então trocar
// aqui quebraria as contas já existentes. O que mudou é ONDE a comparação é
// feita: agora sempre dentro de funções do Postgres (rpc_login e afins),
// nunca mais lendo a coluna senha direto pela API.
export async function hashPassword(password: string): Promise<string> {
    if (!password) return "";
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
