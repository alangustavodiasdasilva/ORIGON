export interface IProducaoVinculo {
    data_producao: string;
    peso: number;
    lab_id?: string;
}

export interface OSItem {
    id: string;
    os_numero: string;
    tomador?: string;
    cliente: string;
    fazenda: string;
    revisor: string;
    status: string;
    data_recepcao: string;
    data_finalizacao?: string;
    data_acondicionamento?: string;
    total_amostras: number;
    horas?: number;
    nota_fiscal: string;
    lab_id?: string;
}
