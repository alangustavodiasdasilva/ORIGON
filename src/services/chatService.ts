export interface ChatMessage {
    id: string;
    text: string;
    sender_id: string;
    sender_name: string;
    sender_foto?: string;
    timestamp: string;
}

const STORAGE_KEY = 'fibertech_chat_history';

export const ChatService = {
    getMessages(): ChatMessage[] {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    saveMessage(message: ChatMessage): void {
        const messages = this.getMessages();
        messages.push(message);
        // Keep only last 50 messages for performance
        const lastMessages = messages.slice(-50);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lastMessages));
    },

    clearHistory(): void {
        localStorage.removeItem(STORAGE_KEY);
    }
};
