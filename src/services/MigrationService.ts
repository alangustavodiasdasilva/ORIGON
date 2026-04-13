import { supabase } from "@/lib/supabase";

const STORAGE_KEYS = {
    LABS: 'fibertech_labs',
    ANALISTAS: 'fibertech_analistas',
    MACHINES: 'fibertech_machines'
};

const getLocal = (key: string) => {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

export const MigrationService = {
    async pushLocalToCloud() {
        // ── Guarda de migração única ──────────────────────────────────────────
        // A migração local→nuvem deve ocorrer SOMENTE UMA VEZ (na primeira sessão).
        // Depois disso, o Supabase é a fonte de verdade. Re-executar esta função
        // causaria o re-envio de registros já DELETADOS pelo usuário (bug do "fantasma").
        const MIGRATION_FLAG = 'fibertech_migration_v1_done';
        if (localStorage.getItem(MIGRATION_FLAG) === 'true') {
            console.log('[MigrationService] Migração já realizada. Pulando.');
            return;
        }

        console.log('[MigrationService] Iniciando migração única: Local → Cloud');

        // 1. Migrate Labs
        const localLabs = getLocal(STORAGE_KEYS.LABS);
        const labMap: Record<string, string> = {}; // oldId -> newId (if changed)

        for (const lab of localLabs) {
            try {
                // Check if it's the blacklisted 'LABORATORIO TEST'
                if (lab.codigo === '251836' || lab.nome?.toUpperCase().includes('LABORATORIO TEST')) {
                    console.warn(`[MigrationService] Skipping blacklisted test lab: ${lab.nome}`);
                    continue;
                }

                // Check if lab already exists by code to avoid duplicates
                const { data: existing } = await supabase.from('laboratorios').select('id').eq('codigo', lab.codigo).single();

                if (existing) {
                    labMap[lab.id] = existing.id;
                    console.log(`Lab ${lab.nome} already exists in cloud.`);
                } else {
                    const { data: newLab, error } = await supabase.from('laboratorios').insert([{
                        nome: lab.nome,
                        codigo: lab.codigo,
                        cidade: lab.cidade,
                        estado: lab.estado
                    }]).select().single();

                    if (error) throw error;
                    labMap[lab.id] = newLab.id;
                    console.log(`Lab ${lab.nome} migrated to cloud.`);
                }
            } catch (err) {
                console.error(`Failed to migrate lab ${lab.nome}:`, err);
            }
        }

        // 2. Migrate Analysts
        const localAnalysts = getLocal(STORAGE_KEYS.ANALISTAS);
        for (const analyst of localAnalysts) {
            try {
                const { data: existing } = await supabase.from('analistas').select('id').eq('email', analyst.email).single();

                if (existing) {
                    console.log(`Analyst ${analyst.nome} already exists.`);
                } else {
                    const newLabId = analyst.lab_id ? labMap[analyst.lab_id] : null;
                    const { error } = await supabase.from('analistas').insert([{
                        nome: analyst.nome,
                        email: analyst.email,
                        senha: analyst.senha,
                        cargo: analyst.cargo,
                        acesso: analyst.acesso,
                        lab_id: newLabId || null
                    }]);
                    if (error) throw error;
                    console.log(`Analyst ${analyst.nome} migrated.`);
                }
            } catch (err) {
                console.error(`Failed to migrate analyst ${analyst.nome}:`, err);
            }
        }

        // 3. Cleanup Legacy Local Storage
        // Uma vez migrado, o local storage não deve conter os dados antigos para evitar
        // que deleções no cloud sejam revertidas por sincronizações locais futuras.
        localStorage.removeItem(STORAGE_KEYS.LABS);
        localStorage.removeItem(STORAGE_KEYS.ANALISTAS);
        localStorage.removeItem(STORAGE_KEYS.MACHINES);

        // ── Marcar migração como concluída — não voltará a rodar ─────────────
        localStorage.setItem(MIGRATION_FLAG, 'true');
        console.log('[MigrationService] Migração concluída. Dados locais limpos.');
    }
};


