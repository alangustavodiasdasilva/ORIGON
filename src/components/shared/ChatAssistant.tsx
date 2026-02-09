import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Minus, Maximize2, Users2, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChatService, type ChatMessage } from "@/services/chatService";

export default function ChatAssistant() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [hasUnread, setHasUnread] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial load and periodic refresh
    useEffect(() => {
        const loadMessages = () => {
            const history = ChatService.getMessages();

            // Se houver novas mensagens ruidosas (não enviadas por mim)
            if (history.length > messages.length) {
                const latest = history[history.length - 1];
                if (latest.sender_id !== user?.id) {
                    // Notificação sonora
                    if (soundEnabled) {
                        playNotificationSound();
                    }
                    // Bolinha vermelha se o chat estiver fechado ou minimizado
                    if (!isOpen || isMinimized) {
                        setHasUnread(true);
                    }
                }
            }

            setMessages(history);
        };

        loadMessages();
        const interval = setInterval(loadMessages, 2000);
        return () => clearInterval(interval);
    }, [messages.length, user?.id, soundEnabled, isOpen, isMinimized]);

    useEffect(() => {
        if (scrollRef.current && !isMinimized) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isMinimized, isOpen]);

    // Quando abrir o chat e não estiver minimizado, remove a bolinha
    useEffect(() => {
        if (isOpen && !isMinimized) {
            setHasUnread(false);
        }
    }, [isOpen, isMinimized]);

    const playNotificationSound = () => {
        try {
            // Som profissional de notificação
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
            audio.volume = 0.4;
            audio.play().catch(e => console.warn("Interação do usuário necessária para áudio:", e));
        } catch (error) {
            console.error("Falha ao reproduzir som:", error);
        }
    };

    const handleSend = () => {
        if (!input.trim() || !user) return;

        const newMessage: ChatMessage = {
            id: Math.random().toString(36).substr(2, 9),
            text: input,
            sender_id: user.id,
            sender_name: user.nome,
            sender_foto: user.foto, // Agora salva a foto na mensagem
            timestamp: new Date().toISOString()
        };

        ChatService.saveMessage(newMessage);
        setMessages(prev => [...prev, newMessage]);
        setInput("");
    };

    const getInitials = (name: string) => {
        return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    };

    return (
        <>
            {/* Floating Action Button */}
            <button
                onClick={() => {
                    setIsOpen(true);
                    setIsMinimized(false);
                    setHasUnread(false);
                }}
                className={cn(
                    "fixed bottom-8 right-8 z-[200] w-16 h-16 rounded-[2rem] bg-slate-950 text-white flex items-center justify-center shadow-2xl transition-all duration-500 hover:scale-110 active:scale-95 group overflow-hidden cursor-pointer",
                    isOpen && !isMinimized ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                    <MessageSquare className="h-6 w-6 group-hover:scale-110 transition-transform" />
                </div>

                {/* Bolinha Vermelha de Notificação */}
                {hasUnread && (
                    <div className="absolute top-4 right-4 w-4 h-4 bg-rose-500 rounded-full border-2 border-slate-950 z-20 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                )}
            </button>

            {/* Chat Window */}
            <div className={cn(
                "fixed bottom-8 right-8 z-[200] w-[400px] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] origin-bottom-right flex flex-col",
                isOpen ? "translate-y-0 opacity-100 scale-100" : "translate-y-12 opacity-0 scale-90 pointer-events-none",
                isMinimized ? "h-[80px]" : "h-[600px]"
            )}>
                {/* Header */}
                <div className="bg-slate-950 text-white p-6 rounded-t-[2.5rem] flex items-center justify-between shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-transparent opacity-50" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center border border-blue-400/30">
                            <Users2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black uppercase tracking-widest italic leading-none">Terminal de Comando</h3>
                                {hasUnread && isMinimized && (
                                    <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic leading-none transition-colors">Conexão Ativa</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 relative z-10">
                        <button
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className={cn(
                                "p-2 rounded-xl transition-colors cursor-pointer",
                                soundEnabled ? "text-blue-400 hover:bg-white/10" : "text-slate-600 hover:bg-white/5"
                            )}
                            title={soundEnabled ? "Desativar Som" : "Ativar Som"}
                        >
                            <BellRing className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                        >
                            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {!isMinimized && (
                    <>
                        <div
                            ref={scrollRef}
                            className="flex-1 bg-card/95 backdrop-blur-2xl p-8 overflow-y-auto space-y-6 scroll-smooth no-scrollbar border-x border-border transition-colors duration-300"
                        >
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4">
                                    <MessageSquare className="h-12 w-12 text-muted" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">Aguardando comunicações...</p>
                                </div>
                            )}

                            {messages.map((msg, idx) => {
                                const isMe = msg.sender_id === user?.id;
                                return (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex flex-col gap-1.5 animate-slide-up",
                                            isMe ? "items-end" : "items-start"
                                        )}
                                        style={{ animationDelay: `${idx * 0.05}s` }}
                                    >
                                        <div className="flex items-center gap-2 mb-1 px-1">
                                            {!isMe && <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 italic">{msg.sender_name}</span>}
                                            <span className="text-[7px] font-bold text-muted uppercase">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="flex gap-3 max-w-[85%]">
                                            {!isMe && (
                                                <div className="w-8 h-8 rounded-xl bg-accent border border-border flex items-center justify-center shrink-0 overflow-hidden transition-colors">
                                                    {msg.sender_foto ? (
                                                        <img src={msg.sender_foto} className="w-full h-full object-cover" alt={msg.sender_name} />
                                                    ) : (
                                                        <span className="text-[10px] font-black text-muted">{getInitials(msg.sender_name)}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className={cn(
                                                "p-4 rounded-[1.5rem] text-xs font-medium leading-relaxed shadow-sm transition-all duration-300",
                                                isMe
                                                    ? "bg-slate-900 text-white rounded-tr-none"
                                                    : "bg-card border border-border text-foreground rounded-tl-none"
                                            )}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Input Area */}
                        <div className="p-6 bg-card border-t border-border rounded-b-[2.5rem] shadow-2xl transition-colors duration-300">
                            <div className="flex items-center gap-3 bg-accent p-2 rounded-2xl border border-border focus-within:border-blue-500/30 transition-all focus-within:shadow-lg focus-within:shadow-blue-500/5">
                                <input
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-black text-foreground placeholder:text-muted/30 px-3 transition-colors"
                                    placeholder="Escrever instrução..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                />
                                <Button
                                    onClick={handleSend}
                                    size="icon"
                                    className="h-10 w-10 bg-slate-900 text-white rounded-xl hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-slate-200"
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </>
    );
}
