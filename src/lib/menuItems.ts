// Itens de menu que podem ser liberados/bloqueados por laboratório (Admin >
// Menu por Laboratório). "Início" e "Configurações" ficam de fora dessa lista
// de propósito — Início é a landing page (sempre acessível) e Configurações já
// é controlado por papel (admin_global/admin_lab).
export const MENU_ITEMS = [
    { key: "lotes", label: "Gerenciar Lotes" },
    { key: "icac", label: "ICAC" },
    { key: "interlaboratorial", label: "Interlaboratorial" },
    { key: "reanalise", label: "Reanálise" },
] as const;

export type MenuItemKey = typeof MENU_ITEMS[number]["key"];

export const ALL_MENU_ITEM_KEYS: MenuItemKey[] = MENU_ITEMS.map(i => i.key);
