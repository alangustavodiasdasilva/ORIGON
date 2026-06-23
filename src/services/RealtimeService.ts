import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface PresenceState {
  user_id: string;
  user_name: string;
  status: 'online' | 'away';
  current_page?: string;
  typing_on?: { table: string; id: string } | null;
  last_seen: string;
}

class RealtimeService {
  private globalChannel: RealtimeChannel | null = null;
  private presenceState: Record<string, PresenceState[]> = {};
  private presenceListeners: Set<(state: Record<string, PresenceState[]>) => void> = new Set();
  
  // Singleton pattern ou init
  public init(userId: string, userName: string) {
    if (this.globalChannel) return;

    try {
        this.globalChannel = supabase.channel('global-presence', {
          config: {
            presence: {
              key: userId,
            },
          },
        });

        this.globalChannel
          .on('presence', { event: 'sync' }, () => {
             const state = this.globalChannel!.presenceState<PresenceState>();
             this.presenceState = state;
             this.notifyListeners();
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
               await this.globalChannel!.track({
                 user_id: userId,
                 user_name: userName,
                 status: 'online',
                 last_seen: new Date().toISOString(),
               });
            }
          });
    } catch (err) {
        console.error("Supabase Channel Init error:", err);
    }
  }

  public async updatePresence(payload: Partial<PresenceState>) {
    if (!this.globalChannel) return;
    
    // Pega o estado atual para dar merge
    const userStateArray = this.presenceState[payload.user_id || ''] || [];
    const currentState = userStateArray[0] || {};
    
    await this.globalChannel.track({
      ...currentState,
      ...payload,
      last_seen: new Date().toISOString()
    });
  }

  public subscribeToPresence(callback: (state: Record<string, PresenceState[]>) => void) {
    this.presenceListeners.add(callback);
    callback(this.presenceState); // Emit current state immediately
    
    return () => {
      this.presenceListeners.delete(callback);
    };
  }

  private notifyListeners() {
    this.presenceListeners.forEach(listener => listener(this.presenceState));
  }

  public cleanup() {
    if (this.globalChannel) {
      this.globalChannel.unsubscribe();
      this.globalChannel = null;
    }
    this.presenceListeners.clear();
  }
}

export const realtimeService = new RealtimeService();
