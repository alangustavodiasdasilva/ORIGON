import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface NotificationSettings {
  sound_enabled: boolean;
  visual_alerts_enabled: boolean;
  desktop_notifications_enabled: boolean;
}

export function NotificationSettings({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<NotificationSettings>({
    sound_enabled: true,
    visual_alerts_enabled: true,
    desktop_notifications_enabled: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
        
      if (data) setSettings(data);
    };
    
    fetchSettings();
  }, [userId]);

  const toggleSetting = async (key: keyof NotificationSettings) => {
    setSaving(true);
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    
    // Updades via Upsert
    await supabase
      .from('user_notification_settings')
      .upsert({ user_id: userId, ...newSettings });
      
    // Tratar permissões do browser se desktop_notifications for ativado
    if (key === 'desktop_notifications_enabled' && newSettings[key]) {
      if ('Notification' in window) {
         Notification.requestPermission();
      }
    }
      
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 max-w-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Preferências de Alerta</h3>
      
      <div className="space-y-4">
        {/* Sound Toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-medium text-slate-700">Alertas Sonoros</span>
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={settings.sound_enabled} onChange={() => toggleSetting('sound_enabled')} disabled={saving} />
            <div className={`block w-10 h-6 rounded-full transition-colors ${settings.sound_enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.sound_enabled ? 'transform translate-x-4' : ''}`}></div>
          </div>
        </label>

        {/* Visual Alerts Toggle */}
         <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-medium text-slate-700 max-w-[80%]">Bordas Vermelhas (Edição Concorrente)</span>
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={settings.visual_alerts_enabled} onChange={() => toggleSetting('visual_alerts_enabled')} disabled={saving} />
            <div className={`block w-10 h-6 rounded-full transition-colors ${settings.visual_alerts_enabled ? 'bg-red-500' : 'bg-slate-300'}`}></div>
            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.visual_alerts_enabled ? 'transform translate-x-4' : ''}`}></div>
          </div>
        </label>

        {/* OS / Desktop Notifications */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm font-medium text-slate-700 max-w-[80%]">Notificações no Desktop</span>
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={settings.desktop_notifications_enabled} onChange={() => toggleSetting('desktop_notifications_enabled')} disabled={saving} />
            <div className={`block w-10 h-6 rounded-full transition-colors ${settings.desktop_notifications_enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.desktop_notifications_enabled ? 'transform translate-x-4' : ''}`}></div>
          </div>
        </label>
      </div>
    </div>
  );
}
