import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

type Language = 'en' | 'pt';

const translations = {
    en: {
        nav: {
            home: "Home",
            batches: "Batches",
            icac: "ICAC Generator",
            interlab: "Interlaboratory",
            quality: "QualityControl",
            config: "Settings"
        },
        status: {
            admin: "ADMINISTRATOR",
            operational: "OPERATIONAL",
            system_status: "SYSTEM STATUS"
        },
        common: {
            active_users: "ACTIVE USERS",
            search: "SEARCH...",
            notifications: "Notifications",
            backup: "Backup",
            import: "Import",
            logout: "TERMINATE SESSION",
            user: "User",
            analyst: "Analyst",
            confirm: "Confirm",
            cancel: "Cancel",
            language: "LANGUAGE",
            english: "ENGLISH",
            portuguese: "PORTUGUESE",
            navigation: "NAVIGATION",
            edit: "Edit",
            delete: "Delete",
            remove: "Remove",
            add: "Add",
            save: "Save",
            create: "Create",
            update: "Update",
            close: "Close",
            loading: "Loading...",
            no_data: "No data available",
            error: "Error",
            success: "Success"
        },
        notifications: {
            no_notifications: "No notifications",
            mark_all_read: "Mark all as read"
        },
        home: {
            title: "Active Batches",
            subtitle: "Operations Command",
            search_placeholder: "SEARCH REFERENCE ID...",
            init_batch: "Init Batch",
            no_batches: "NO ACTIVE BATCHES FOUND",
            active: "ACTIVE",
            locked: "LOCKED",
            digitize: "DIGITIZE",
            analyze: "ANALYZE",
            created: "Created",
            analyst: "Analyst",
            origin: "Origin",
            unit: "Unit",
            data_points: "Data Points",
            lock_batch: "Lock Batch",
            unlock_batch: "Unlock Batch",
            rename_batch: "Rename Batch",
            destroy_batch: "Destroy Batch",
            new_identifier: "New Identifier",
            origin_city: "Origin City",
            save_changes: "Save Changes",
            permanently_delete: "Permanently delete",
            data_loss_warning: "All associated data will be lost.",
            confirm_deletion: "Confirm Deletion",
            batch_identifier: "Batch Identifier",
            initializing: "INITIALIZING...",
            confirm_initialization: "CONFIRM INITIALIZATION",
            initialize_batch_title: "Initialize Batch",
            enter_params: "Enter identification parameters"
        },
        search: {
            placeholder: "Search batches, samples, documents, labs...",
            searching: "Searching...",
            no_results: "No results found",
            try_search: "Try searching by name, ID or city",
            type_to_search: "Type to search",
            instructions: "Use ↑ ↓ to navigate, Enter to open",
            navigate: "↑ ↓ navigate • Enter open • Esc close",
            results: "results",
            result: "result",
            sample: "Sample",
            lab: "Laboratory",
            document: "Document",
            batch: "Batch"
        },
        analysis: {
            no_records: "No records found",
            delete_sample: "Delete sample",
            remove_color: "Remove color",
            apply_color: "Apply",
            selected_sample: "Selected Sample",
            sample: "Sample"
        },
        hvi: {
            cancel: "Cancel",
            confirm_download: "Confirm and Download",
            sample_id: "Sample #"
        },
        admin: {
            linked_lab: "Linked Laboratory",
            edit: "Edit",
            no_machines: "No HVI machines registered for this laboratory.",
            editing_machine: "Editing Machine",
            add_new_machine: "Add New Machine",
            cancel_edit: "Cancel Edit",
            update: "Update",
            add: "Add",
            remove_machine: "Remove this machine?",
            error_no_lab: "Error: No laboratory selected"
        },
        quality: {
            error_no_lab: "Error: Laboratory not identified",
            document_attached: "Document Attached",
            document_removed: "Document Removed"
        },
        inicio: {
            select_lab: "Select Laboratory",
            no_labs: "No laboratories found.",
            create_lab: "Create New Laboratory",
            switch_lab: "Switch Laboratory"
        },
        tools: {
            add_component: "Add Component",
            placeholder_notes: "Type your notes here..."
        },
        stats: {
            samples_processed: "Samples Processed"
        },
        patterns: {
            no_pattern: "No statistical pattern identified in available data"
        }
    },
    pt: {
        nav: {
            home: "Início",
            batches: "Lotes",
            icac: "Gerador ICAC",
            interlab: "Interlaboratorial",
            quality: "Qualidade",
            config: "Configurações"
        },
        status: {
            admin: "ADMINISTRADOR",
            operational: "OPERACIONAL",
            system_status: "STATUS DO SISTEMA"
        },
        common: {
            active_users: "USUÁRIOS ATIVOS",
            search: "BUSCAR...",
            notifications: "Notificações",
            backup: "Backup",
            import: "Importar",
            logout: "ENCERRAR SESSÃO",
            user: "Usuário",
            analyst: "Analista",
            confirm: "Confirmar",
            cancel: "Cancelar",
            language: "IDIOMA",
            english: "INGLÊS",
            portuguese: "PORTUGUÊS",
            navigation: "NAVEGAÇÃO",
            edit: "Editar",
            delete: "Excluir",
            remove: "Remover",
            add: "Adicionar",
            save: "Salvar",
            create: "Criar",
            update: "Atualizar",
            close: "Fechar",
            loading: "Carregando...",
            no_data: "Nenhum dado disponível",
            error: "Erro",
            success: "Sucesso"
        },
        notifications: {
            no_notifications: "Nenhuma notificação",
            mark_all_read: "Marcar todas como lidas"
        },
        home: {
            title: "Lotes Ativos",
            subtitle: "Comando de Operações",
            search_placeholder: "BUSCAR ID DE REFERÊNCIA...",
            init_batch: "Iniciar Lote",
            no_batches: "Nenhum lote ativo encontrado",
            active: "ATIVO",
            locked: "BLOQUEADO",
            digitize: "DIGITALIZAR",
            analyze: "ANALISAR",
            created: "Criado",
            analyst: "Analista",
            origin: "Origem",
            unit: "Unidade",
            data_points: "Pontos de Dados",
            lock_batch: "Bloquear Lote",
            unlock_batch: "Desbloquear Lote",
            rename_batch: "Renomear Lote",
            destroy_batch: "Excluir Lote",
            new_identifier: "Novo Identificador",
            origin_city: "Cidade de Origem",
            save_changes: "Salvar Alterações",
            permanently_delete: "Excluir permanentemente",
            data_loss_warning: "Todos os dados associados serão perdidos.",
            confirm_deletion: "Confirmar Exclusão",
            batch_identifier: "Identificador do Lote",
            initializing: "INICIANDO...",
            confirm_initialization: "CONFIRMAR INICIALIZAÇÃO",
            initialize_batch_title: "Iniciar Lote",
            enter_params: "Insira os parâmetros de identificação"
        },
        search: {
            placeholder: "Buscar lotes, amostras, documentos, laboratórios...",
            searching: "Buscando...",
            no_results: "Nenhum resultado encontrado",
            try_search: "Tente buscar por nome, ID ou cidade",
            type_to_search: "Digite para buscar",
            instructions: "Use ↑ ↓ para navegar, Enter para abrir",
            navigate: "↑ ↓ navegar • Enter abrir • Esc fechar",
            results: "resultados",
            result: "resultado",
            sample: "Amostra",
            lab: "Laboratório",
            document: "Documento",
            batch: "Lote"
        },
        analysis: {
            no_records: "Nenhum registro encontrado",
            delete_sample: "Excluir amostra",
            remove_color: "Remover cor",
            apply_color: "Aplicar",
            selected_sample: "Amostra Selecionada",
            sample: "Amostra"
        },
        hvi: {
            cancel: "Cancelar",
            confirm_download: "Confirmar e Baixar",
            sample_id: "Amostra #"
        },
        admin: {
            linked_lab: "Laboratório Vinculado",
            edit: "Editar",
            no_machines: "Nenhuma máquina HVI cadastrada para este laboratório.",
            editing_machine: "Editando Máquina",
            add_new_machine: "Adicionar Nova Máquina",
            cancel_edit: "Cancelar Edição",
            update: "Atualizar",
            add: "Adicionar",
            remove_machine: "Remover esta máquina?",
            error_no_lab: "Erro: Nenhum laboratório selecionado"
        },
        quality: {
            error_no_lab: "Erro: Laboratório não identificado",
            document_attached: "Documento Anexado",
            document_removed: "Documento Removido"
        },
        inicio: {
            select_lab: "Selecione o Laboratório",
            no_labs: "Nenhum laboratório encontrado.",
            create_lab: "Criar Novo Laboratório",
            switch_lab: "Trocar Laboratório"
        },
        tools: {
            add_component: "Adicionar Componente",
            placeholder_notes: "Digite suas observações aqui..."
        },
        stats: {
            samples_processed: "Amostras Processadas"
        },
        patterns: {
            no_pattern: "Nenhum padrão estatístico identificado nos dados disponíveis"
        }
    }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

// Helper to access nested keys using dot notation (e.g., 'nav.home')
function getNestedTranslation(obj: any, path: string): string {
    return path.split('.').reduce((prev, curr) => {
        return prev ? prev[curr] : null;
    }, obj) || path;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        const storedLang = localStorage.getItem('app_language') as Language;
        if (storedLang && (storedLang === 'en' || storedLang === 'pt')) {
            setLanguageState(storedLang);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('app_language', lang);
    };

    const t = (key: string): string => {
        return getNestedTranslation(translations[language], key);
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => useContext(LanguageContext);
