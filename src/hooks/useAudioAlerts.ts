import { useEffect, useState, useCallback } from 'react';
import { realtimeService } from '@/services/RealtimeService';

export interface AudioConfig {
  greenUrl: string;
  redUrl: string;
}

const DEFAULT_CONFIG: AudioConfig = {
  greenUrl: 'https://cdn.freesound.org/previews/171/171697_2437358-lq.mp3', // Generic success bell
  redUrl: 'https://cdn.freesound.org/previews/131/131660_2398403-lq.mp3', // Generic error buzzer
};

export function useAudioAlerts() {
  const [config, setConfig] = useState<AudioConfig>(() => {
    const saved = localStorage.getItem('fibertech_audio_config');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  // Salvar config e avisar a rede (P2P Sync)
  const updateConfig = useCallback((newConfig: AudioConfig) => {
    setConfig(newConfig);
    localStorage.setItem('fibertech_audio_config', JSON.stringify(newConfig));
    realtimeService.broadcast('config_sync', newConfig);
  }, []);

  // Tocar um alerta localmente
  const playAlert = useCallback((color: 'green' | 'red') => {
    const url = color === 'green' ? config.greenUrl : config.redUrl;
    if (url && url.trim().length > 0) {
      const audio = new Audio(url.trim());
      audio.volume = 1.0;
      audio.play().catch(e => console.error("Falha ao tocar som:", e));
    }
  }, [config]);

  // Transmitir para todos tocarem o alerta
  const broadcastAlert = useCallback((color: 'green' | 'red') => {
    playAlert(color); // Tocar localmente primeiro
    realtimeService.broadcast('system_alert', { color });
  }, [playAlert]);

  // Efeito principal: escutar WebSockets
  useEffect(() => {
    // 1. Escutar se algum administrador enviar uma nova configuração P2P
    const unsubsConfig = realtimeService.subscribeToBroadcast('config_sync', (payload: AudioConfig) => {
      console.log("Recebida nova configuração de áudio da rede");
      setConfig(payload);
      localStorage.setItem('fibertech_audio_config', JSON.stringify(payload));
    });

    // 2. Escutar os botões apertados por qualquer laboratório
    const unsubsAlert = realtimeService.subscribeToBroadcast('system_alert', (payload: { color: 'green' | 'red' }) => {
      playAlert(payload.color);
    });

    return () => {
      unsubsConfig();
      unsubsAlert();
    };
  }, [playAlert]);

  // Pedir configuração atual para a rede apenas UMA vez ao montar o componente
  useEffect(() => {
    // Dá um pequeno delay para garantir que o canal de websocket está pronto
    const timer = setTimeout(() => {
      realtimeService.broadcast('request_config_sync', {});
    }, 1000);
    return () => clearTimeout(timer);
  }, []);


  // Ouvinte para quem tem a configuração "Master"
  useEffect(() => {
    const unsubsRequest = realtimeService.subscribeToBroadcast('request_config_sync', () => {
      // Se eu tenho uma configuração salva diferente do padrão, eu compartilho com o novato
      const saved = localStorage.getItem('fibertech_audio_config');
      if (saved) {
        realtimeService.broadcast('config_sync', JSON.parse(saved));
      }
    });
    return () => {
      unsubsRequest();
    };
  }, []);

  return { config, updateConfig, playAlert, broadcastAlert };
}
