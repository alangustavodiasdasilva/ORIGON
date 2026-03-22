
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials not found. System will fallback to local storage or show empty state.");
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder',
    {
        global: {
            fetch: (url, options) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 8000);
                return fetch(url, { ...options, signal: controller.signal })
                    .finally(() => clearTimeout(id));
            }
        }
    }
);
