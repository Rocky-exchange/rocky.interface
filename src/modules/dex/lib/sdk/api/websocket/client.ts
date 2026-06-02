/**
 * Rocky WebSocket Client
 */

export type MessageHandler = (data: unknown) => void;

export interface WsConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface AuthMessage {
  type: 'auth';
  address: string;
  signature: string;
  timestamp: number;
}

export interface SubscribeMessage {
  type: 'subscribe';
  channel: string;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  channel: string;
}

export interface ServerMessage {
  type: string;
  channel?: string;
  data?: unknown;
  success?: boolean;
  message?: string;
  code?: string;
}

export class RockyWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number = 0;
  private subscriptions: Set<string> = new Set();
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private authenticated: boolean = false;
  private authCredentials: AuthMessage | null = null;
  private connectionPromise: Promise<void> | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(config: WsConfig) {
    this.url = config.url;
    this.reconnectInterval = config.reconnectInterval || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.reconnectAttempts = 0;
          this.startPing();

          // Re-authenticate if we have credentials
          if (this.authCredentials) {
            this.send(this.authCredentials);
          }

          // Re-subscribe to channels
          this.subscriptions.forEach((channel) => {
            this.send({ type: 'subscribe', channel });
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
        };

        this.ws.onclose = () => {
          console.log('[WS] Disconnected');
          this.stopPing();
          this.connectionPromise = null;
          this.authenticated = false;
          this.reconnect();
        };
      } catch (error) {
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopPing();
    this.connectionPromise = null;
  }

  /**
   * Authenticate with the server
   */
  async authenticate(address: string, signature: string): Promise<boolean> {
    this.authCredentials = {
      type: 'auth',
      address,
      signature,
      timestamp: Math.floor(Date.now() / 1000),
    };

    return new Promise((resolve) => {
      const handler = (data: ServerMessage) => {
        if (data.type === 'authresult') {
          this.authenticated = data.success || false;
          this.off('authresult', handler);
          resolve(this.authenticated);
        }
      };

      this.on('authresult', handler);
      this.send(this.authCredentials);
    });
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string): void {
    this.subscriptions.add(channel);

    if (this.isConnected()) {
      this.send({ type: 'subscribe', channel });
    }
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);

    if (this.isConnected()) {
      this.send({ type: 'unsubscribe', channel });
    }

    // Remove all handlers for this channel
    this.handlers.delete(channel);
  }

  /**
   * Register a message handler for a channel
   */
  on(channel: string, handler: MessageHandler): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
  }

  /**
   * Remove a message handler
   */
  off(channel: string, handler: MessageHandler): void {
    this.handlers.get(channel)?.delete(handler);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Send a message
   */
  private send(message: unknown): void {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message: ServerMessage = JSON.parse(data);

      // Handle pong
      if (message.type === 'pong') {
        return;
      }

      // Handle channel data
      if (message.channel) {
        const handlers = this.handlers.get(message.channel);
        handlers?.forEach((handler) => handler(message.data));
      }

      // Also trigger type-based handlers
      const typeHandlers = this.handlers.get(message.type);
      typeHandlers?.forEach((handler) => handler(message));
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }

  /**
   * Reconnect to server
   */
  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Start ping interval
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Default WebSocket client instance
export const wsClient = new RockyWebSocketClient({
  url: import.meta.env.VITE_WS_URL || 'wss://api.primit.io/v1',
});
