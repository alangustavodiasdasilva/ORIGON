
import { supabase } from "@/lib/supabase";

export interface Machine {
    id: string;
    machineId: string; // "ID da Máquina" e.g. "HVI 01"
    serialNumber: string; // "Número de Série"
    model: 'USTER' | 'PREMIER';
    labId: string; // Vínculo com Laboratório
    created_at?: string;
}

const STORAGE_KEY = 'fibertech_machines';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const getStoredMachines = (): Machine[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const saveStoredMachines = (machines: Machine[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
};

export const MachineService = {
    async list(): Promise<Machine[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('maquinas').select('*').order('identificacao');
            if (error) throw error;

            // Supabase é a fonte de verdade — sincroniza o localStorage e retorna
            const machines = (data || []).map((m: any) => ({
                id: m.id,
                machineId: m.identificacao,
                serialNumber: m.numero_serie,
                model: m.modelo,
                labId: m.lab_id,
                created_at: m.created_at
            }))
            // FILTRO DE SEGURANÇA: Somente do 1 ao 7
            .filter(m => {
                const num = parseInt(m.machineId.replace(/\D/g, ''), 10);
                return !isNaN(num) && num >= 1 && num <= 7;
            });

            saveStoredMachines(machines);
            return machines;
        }
        return getStoredMachines().filter(m => {
            const num = parseInt(m.machineId.replace(/\D/g, ''), 10);
            return !isNaN(num) && num >= 1 && num <= 7;
        });
    },

    async listByLab(labId: string): Promise<Machine[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase
                .from('maquinas')
                .select('*')
                .eq('lab_id', labId);

            if (error) throw error;

            return data.map((m: any) => ({
                id: m.id,
                machineId: m.identificacao,
                serialNumber: m.numero_serie,
                model: m.modelo,
                labId: m.lab_id,
                created_at: m.created_at
            }))
            // FILTRO DE SEGURANÇA: Somente do 1 ao 7
            .filter(m => {
                const num = parseInt(m.machineId.replace(/\D/g, ''), 10);
                return !isNaN(num) && num >= 1 && num <= 7;
            });
        }
        return getStoredMachines()
            .filter(m => m.labId === labId)
            .filter(m => {
                const num = parseInt(m.machineId.replace(/\D/g, ''), 10);
                return !isNaN(num) && num >= 1 && num <= 7;
            });
    },

    async create(data: Omit<Machine, 'id' | 'created_at'>): Promise<Machine> {
        // SEGURANÇA: Rastreamento de chamada para descobrir quem está criando máquinas 'fantasma'
        console.trace(`MachineService.create chamado para: ${data.machineId}`);

        // Validação Estrita: 1-7
        const machineNum = parseInt(data.machineId.replace(/\D/g, ''), 10);
        if (isNaN(machineNum) || machineNum < 1 || machineNum > 7) {
            console.error(`BLOQUEIO DE SEGURANÇA: Tentativa de criar máquina fora do range 1-7: ${data.machineId}`);
            throw new Error(`Máquina ${data.machineId} não autorizada. Contate o administrador.`);
        }

        if (isSupabaseEnabled()) {
            const dbData = {
                identificacao: data.machineId,
                numero_serie: data.serialNumber,
                modelo: data.model,
                lab_id: data.labId
            };

            const { data: newMachine, error } = await supabase
                .from('maquinas')
                .insert([dbData])
                .select()
                .single();

            if (error) throw error;

            return {
                id: newMachine.id,
                machineId: newMachine.identificacao,
                serialNumber: newMachine.numero_serie,
                model: newMachine.modelo,
                labId: newMachine.lab_id,
                created_at: newMachine.created_at
            };
        }

        const machines = getStoredMachines();
        const newMachine: Machine = {
            ...data,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString()
        };
        machines.push(newMachine);
        saveStoredMachines(machines);
        return newMachine;
    },

    async update(id: string, data: Partial<Machine>): Promise<Machine> {
        if (isSupabaseEnabled()) {
            const dbUpdates: any = {};
            if (data.machineId) dbUpdates.identificacao = data.machineId;
            if (data.serialNumber) dbUpdates.numero_serie = data.serialNumber;
            if (data.model) dbUpdates.modelo = data.model;
            if (data.labId) dbUpdates.lab_id = data.labId;

            const { data: updated, error } = await supabase
                .from('maquinas')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            return {
                id: updated.id,
                machineId: updated.identificacao,
                serialNumber: updated.numero_serie,
                model: updated.modelo,
                labId: updated.lab_id,
                created_at: updated.created_at
            };
        }

        const machines = getStoredMachines();
        const index = machines.findIndex(m => m.id === id);
        if (index === -1) throw new Error("Machine not found");

        machines[index] = { ...machines[index], ...data };
        saveStoredMachines(machines);
        return machines[index];
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('maquinas').delete().eq('id', id).select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Permissão negada pelo servidor ou máquina já excluída.");
            }
        }
        // SEMPRE limpa do localStorage — independente do Supabase estar ativo ou não
        // Isso evita que dados deletados reapareçam via fallback
        const machines = getStoredMachines();
        saveStoredMachines(machines.filter(m => m.id !== id));
    },

    subscribe(callback: () => void): () => void {
        if (!isSupabaseEnabled()) return () => { };

        const channel = supabase
            .channel('maquinas-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'maquinas' },
                () => callback()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    async cleanupGhostMachines(): Promise<number> {
        if (!isSupabaseEnabled()) return 0;
        
        const { data, error } = await supabase.from('maquinas').select('id, identificacao');
        if (error) throw error;

        const ghosts = (data || []).filter(m => {
            const num = parseInt(m.identificacao.replace(/\D/g, ''), 10);
            return isNaN(num) || num < 1 || num > 7;
        });

        if (ghosts.length === 0) return 0;

        console.log(`Cleaning up ${ghosts.length} ghost machines...`);
        const { error: delError } = await supabase
            .from('maquinas')
            .delete()
            .in('id', ghosts.map(g => g.id));
            
        if (delError) throw delError;
        
        return ghosts.length;
    }
};
