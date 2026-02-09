import { supabase } from "@/lib/supabase";

export interface ChatMessage {
    id: string;
    text: string;
    sender_id: string;
    sender_name: string;
    sender_foto?: string;
    timestamp: string;
}

const STORAGE_KEY = 'fibertech_chat_history';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const ChatService = {
    async getMessages(): Promise<ChatMessage[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase
                .from('chat_mensagens')
                .select('*')
                .order('timestamp', { ascending: true }); // Messages in chronological order

            if (error) {
                console.error("Error fetching chat:", error);
                return [];
            }
            return data;
        }

        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    async saveMessage(message: ChatMessage): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('chat_mensagens').insert([{
                id: message.id,
                text: message.text,
                sender_id: message.sender_id,
                sender_name: message.sender_name,
                sender_foto: message.sender_foto,
                timestamp: message.timestamp
            }]);

            if (error) console.error("Error saving message:", error);
            return;
        }

        const messages = await this.getMessages(); // Changed to await to match signature even if local
        messages.push(message);
        // Keep only last 50 messages for performance
        const lastMessages = messages.slice(-50);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lastMessages));
    },

    async clearHistory(): Promise<void> {
        if (isSupabaseEnabled()) {
            // Optional: Implement clearing chat in DB or just local?
            // Usually we don't clear DB history from client easily.
            // Let's leave it as no-op or specific admin feature.
            return;
        }
        localStorage.removeItem(STORAGE_KEY);
    }
};
