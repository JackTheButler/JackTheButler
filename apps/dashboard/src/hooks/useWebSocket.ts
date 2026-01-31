import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from './useAuth';

interface WSMessage {
  type: string;
  payload?: unknown;
}

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number>();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuth((state) => state.isAuthenticated);

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'stats:tasks':
          queryClient.setQueryData(['taskStats'], message.payload);
          // Also refresh task list if on Tasks page
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          break;
        case 'stats:approvals':
          queryClient.setQueryData(['approvalStats'], { stats: message.payload });
          // Also refresh approvals list if on Approvals page
          queryClient.invalidateQueries({ queryKey: ['approvals'] });
          break;
        case 'stats:conversations':
          queryClient.setQueryData(['conversationStats'], message.payload);
          // Also refresh conversations list if on Inbox page
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          break;
        case 'connected':
          console.log('[WebSocket] Connected', message.payload);
          break;
        case 'pong':
          // Heartbeat response
          break;
        default:
          console.log('[WebSocket] Unknown message type:', message.type);
      }
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    const token = api.getToken();
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('[WebSocket] Connected');
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code);
        // Reconnect after 3 seconds (unless intentional close)
        if (event.code !== 1000) {
          reconnectTimeout.current = window.setTimeout(connect, 3000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
    }
  }, [handleMessage]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close(1000, 'Component unmounted');
      }
    };
  }, [isAuthenticated, connect]);

  return {
    isConnected: ws.current?.readyState === WebSocket.OPEN,
  };
}
