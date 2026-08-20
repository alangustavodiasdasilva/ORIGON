// Guarda o FileSystemDirectoryHandle (pasta escolhida pelo usuário) no IndexedDB
// deste navegador/computador, indexado por laboratório. Um FileSystemDirectoryHandle
// não pode ser salvo no Supabase (é um objeto local do navegador, não serializável
// entre máquinas) — por isso cada computador precisa escolher a pasta uma vez.

const DB_NAME = 'origo_folder_handles';
const STORE_NAME = 'handles';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                req.result.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export function isFolderPickerSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';
}

export async function saveFolderHandle(labId: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, labId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getFolderHandle(labId: string): Promise<FileSystemDirectoryHandle | null> {
    if (!isFolderPickerSupported()) return null;
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(labId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

export async function removeFolderHandle(labId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(labId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// Verifica se já temos permissão de escrita; se não, pede (isso SÓ funciona
// como resposta direta a um clique do usuário — não dá pra chamar "sozinho"
// em segundo plano).
export async function ensureFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const opts = { mode: 'readwrite' as const };
    try {
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
    } catch {
        // queryPermission/requestPermission podem falhar fora de um gesto do
        // usuário — trata como "sem permissão" e deixa o chamador cair no
        // download padrão.
    }
    return false;
}
