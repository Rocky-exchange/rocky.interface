/**
 * WebSocket Hook
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { wsClient, MessageHandler } from '../api/websocket';

export interface UseWebSocketReturn {
  isConnected: boolean;
  subscribe: (channel: string, handler: MessageHandler) => void;
  unsubscribe: (channel: string, handler?: MessageHandler) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());

  // Connect on mount
  useEffect(() => {
    wsClient.connect().then(() => {
      setIsConnected(true);
    });

    // Monitor connection state
    const checkConnection = setInterval(() => {
      setIsConnected(wsClient.isConnected());
    }, 1000);

    return () => {
      clearInterval(checkConnection);
    };
  }, []);

  // Subscribe to a channel
  const subscribe = useCallback((channel: string, handler: MessageHandler) => {
    // Track handler
    if (!handlersRef.current.has(channel)) {
      handlersRef.current.set(channel, new Set());
    }
    handlersRef.current.get(channel)!.add(handler);

    // Subscribe via client
    wsClient.on(channel, handler);
    wsClient.subscribe(channel);
  }, []);

  // Unsubscribe from a channel
  const unsubscribe = useCallback((channel: string, handler?: MessageHandler) => {
    if (handler) {
      // Remove specific handler
      wsClient.off(channel, handler);
      handlersRef.current.get(channel)?.delete(handler);
    } else {
      // Remove all handlers and unsubscribe
      const handlers = handlersRef.current.get(channel);
      handlers?.forEach((h) => wsClient.off(channel, h));
      handlersRef.current.delete(channel);
      wsClient.unsubscribe(channel);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handlersRef.current.forEach((handlers, channel) => {
        handlers.forEach((handler) => wsClient.off(channel, handler));
      });
      handlersRef.current.clear();
    };
  }, []);

  return {
    isConnected,
    subscribe,
    unsubscribe,
  };
}
