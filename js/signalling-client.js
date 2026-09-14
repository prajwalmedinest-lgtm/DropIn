/**
 * DropIn - Robust WebSocket Signalling Client
 * Features:
 * - Automatic exponential backoff reconnection within the active 120s session window
 * - Outgoing message queueing while connecting / reconnecting
 * - Periodic WebSocket keepalive ping/pong
 * - Clean teardown and explicit closure prevention of reconnection leaks
 * - Robust error handling for network hiccups and signal drops
 */
export class SignallingClient {
  /**
   * @param {object} options
   * @param {'receiver'|'sender'} options.role
   * @param {string} [options.sessionId]
   * @param {(msg: any) => void} options.onMessage
   * @param {(data: Blob|ArrayBuffer) => void} [options.onBinary]
   * @param {(status: 'connected'|'reconnecting'|'disconnected') => void} [options.onStatusChange]
   * @param {(error: Error|Event) => void} [options.onError]
   */
  constructor(options) {
    this.role = options.role;
    this.sessionId = options.sessionId || '';
    this.onMessage = options.onMessage || (() => {});
    this.onBinary = options.onBinary || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});

    this.ws = null;
    this.isSessionActive = false;
    this.isExplicitlyClosed = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 25;
    this.reconnectTimer = null;
    this.keepaliveTimer = null;
    this.messageQueue = [];
    this.lastConnectedTime = 0;

    // Mobile OS background / camera wakeup handlers
    this.setupVisibilityListeners();
  }

  get isConnected() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  get bufferedAmount() {
    return this.ws ? this.ws.bufferedAmount || 0 : 0;
  }

  setupVisibilityListeners() {
    if (typeof document === 'undefined') return;

    const handleWakeup = () => {
      if (document.visibilityState === 'visible' && this.isSessionActive && !this.isExplicitlyClosed) {
        console.log(`[SignallingClient] Tab resumed / active. Checking socket health for ${this.role}...`);
        if (!this.isConnected) {
          this.ensureConnected();
        } else {
          // Send instant ping to verify TCP connection didn't silently die while backgrounded
          try {
            this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
          } catch (e) {
            this.ensureConnected();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('pageshow', handleWakeup);
    window.addEventListener('focus', handleWakeup);
  }

  /**
   * Immediately re-establish connection without waiting for backoff timers
   */
  ensureConnected() {
    if (this.isExplicitlyClosed || !this.isSessionActive) return;
    if (this.isConnected) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  /**
   * Wait until signalling socket is connected and confirmed
   * @param {number} timeoutMs
   * @returns {Promise<boolean>}
   */
  waitUntilConnected(timeoutMs = 10000) {
    if (this.isConnected) return Promise.resolve(true);
    this.ensureConnected();

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (this.isConnected) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error('Signalling connection timeout'));
        }
      }, 80);
    });
  }

  /**
   * Start or reset connection for a session
   * @param {string} sessionId
   */
  start(sessionId) {
    if (sessionId) {
      this.sessionId = sessionId;
    }
    this.isSessionActive = true;
    this.isExplicitlyClosed = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    this.connect();
  }

  getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  connect() {
    if (this.isExplicitlyClosed || !this.isSessionActive) {
      return;
    }

    this.cleanupSocketOnly();

    const wsUrl = this.getWsUrl();
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (this.isExplicitlyClosed || !this.isSessionActive) {
          try { this.ws.close(1000); } catch (e) {}
          return;
        }

        console.log(`[SignallingClient] Connected as ${this.role} for session: ${this.sessionId}`);
        this.reconnectAttempts = 0;
        this.lastConnectedTime = Date.now();
        this.startKeepalive();

        // Register role with session immediately
        this.sendJson({
          type: this.role === 'receiver' ? 'join-receiver' : 'join-sender',
          sessionId: this.sessionId
        });

        // Flush queued messages that were buffered during connection/reconnection
        this.flushQueue();
        this.onStatusChange('connected');
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
          this.onBinary(event.data);
          return;
        }

        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') {
            // Keepalive pong received
            return;
          }
          this.onMessage(msg);
        } catch (e) {
          // Pass raw string if non-JSON (e.g. relay payloads)
          this.onMessage({ type: 'raw-string', data: event.data });
        }
      };

      this.ws.onclose = (event) => {
        this.stopKeepalive();
        if (this.isExplicitlyClosed || !this.isSessionActive) {
          console.log(`[SignallingClient] Socket closed cleanly (${this.role})`);
          return;
        }

        console.warn(`[SignallingClient] Socket dropped (${this.role}, code: ${event.code}). Scheduling reconnection...`);
        this.onStatusChange('reconnecting');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn(`[SignallingClient] Socket notice (${this.role}):`, err);
        this.onError(err);
      };

    } catch (err) {
      console.warn(`[SignallingClient] Socket instantiation exception:`, err);
      this.onError(err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.isExplicitlyClosed || !this.isSessionActive) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.warn(`[SignallingClient] Max reconnect attempts reached for session ${this.sessionId}`);
      return;
    }

    // Exponential backoff: 300ms, 500ms, 900ms, 1600ms, 2500ms max with random jitter
    const baseDelay = Math.min(2500, Math.pow(1.5, Math.min(this.reconnectAttempts, 7)) * 250);
    const delay = baseDelay + Math.random() * 200;

    console.log(`[SignallingClient] Attempting reconnection #${this.reconnectAttempts} in ${Math.round(delay)}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isSessionActive && !this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
        } catch (e) {
          console.warn('[SignallingClient] Ping send failed:', e);
        }
      }
    }, 4500);
  }

  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(data);
        return true;
      } catch (e) {
        console.warn('[SignallingClient] Send failed, buffering:', e);
      }
    }

    // Queue text / JSON messages if currently reconnecting or offline
    if (typeof data === 'string') {
      this.messageQueue.push(data);
    }
    return false;
  }

  sendJson(obj) {
    return this.send(JSON.stringify(obj));
  }

  flushQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      try {
        this.ws.send(item);
      } catch (e) {
        console.warn('[SignallingClient] Error sending queued message, re-queueing:', e);
        this.messageQueue.unshift(item);
        break;
      }
    }
  }

  cleanupSocketOnly() {
    this.stopKeepalive();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close(1000, 'Reconnecting or replacing socket');
      } catch (e) {}
      this.ws = null;
    }
  }

  /**
   * Complete clean teardown of signalling client (e.g. session expired or reset)
   */
  close() {
    this.isSessionActive = false;
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopKeepalive();
    this.messageQueue = [];
    this.cleanupSocketOnly();
  }
}
