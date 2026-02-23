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
        console.log("Starting migration: Local -> Cloud");

        // 1. Migrate Labs
        const localLabs = getLocal(STORAGE_KEYS.LABS);
        const labMap: Record<string, string> = {}; // oldId -> newId (if changed)

        for (const lab of localLabs) {
            try {
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

        // 3. Migrate Machines
        const localMachines = getLocal(STORAGE_KEYS.MACHINES);
        for (const machine of localMachines) {
            try {
                // Machines usually don't have a unique field besides ID, let's use serialNumber
                const { data: existing } = await supabase.from('maquinas').select('id').eq('numero_serie', machine.serialNumber).single();

                if (existing) {
                    console.log(`Machine ${machine.machineId} already exists.`);
                } else {
                    const newLabId = machine.labId ? labMap[machine.labId] : null;
                    const { error } = await supabase.from('maquinas').insert([{
                        identificacao: machine.machineId,
                        numero_serie: machine.serialNumber,
                        modelo: machine.model,
                        lab_id: newLabId || null
                    }]);
                    if (error) throw error;
                    console.log(`Machine ${machine.machineId} migrated.`);
                }
            } catch (err) {
                console.error(`Failed to migrate machine ${machine.machineId}:`, err);
            }
        }

        console.log("Migration complete.");
    }
};
