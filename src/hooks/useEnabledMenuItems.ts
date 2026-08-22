import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { labMenuService } from "@/services/labMenu.service";
import { ALL_MENU_ITEM_KEYS, type MenuItemKey } from "@/lib/menuItems";

// Usado por Layout.tsx (menu lateral) e Inicio.tsx (cards de ação rápida) pra
// os dois sempre mostrarem exatamente as mesmas abas liberadas pro laboratório
// atual. admin_global nunca é restringido (mesmo padrão de lockdown/lentidão
// por laboratório — ele precisa ver tudo pra poder configurar qualquer lab).
export function useEnabledMenuItems(): MenuItemKey[] {
    const { user, currentLab, isLoading: authLoading } = useAuth();
    const [enabledItems, setEnabledItems] = useState<MenuItemKey[]>(ALL_MENU_ITEM_KEYS);

    useEffect(() => {
        if (authLoading) return;
        if (user?.acesso === 'admin_global') {
            setEnabledItems(ALL_MENU_ITEM_KEYS);
            return;
        }

        const labId = currentLab?.id || user?.lab_id || null;
        if (!labId) {
            setEnabledItems(ALL_MENU_ITEM_KEYS);
            return;
        }

        let cancelled = false;
        labMenuService.get(labId).then(items => { if (!cancelled) setEnabledItems(items); });

        const unsubscribe = labMenuService.subscribe(labId, items => setEnabledItems(items));
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [user, currentLab, authLoading]);

    return enabledItems;
}
