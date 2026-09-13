/**
 * DropIn - Session & Memory Lifecycle Management Module
 * 
 * Provides:
 * - SessionManager: Central authority for session state, 120s TTL lifecycle,
 *   active buffer tracking, Blob Object URL management, and zero-trace memory purging.
 * - Ephemeral session ID generator and URL builder
 * - Human-readable byte and time formatting helpers
 * - SessionCountdownTimer for precise 120s countdowns
 */

const SESSION_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Generate a cryptographically random session ID
 * @param {number} length 
 * @returns {string}
 */
export function generateSessionId(length = 12) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += SESSION_ALPHABET[bytes[i] % SESSION_ALPHABET.length];
  }
  return id;
}

/**
 * Get full sender URL for a session ID
 * @param {string} sessionId 
 * @returns {string}
 */
export function getSessionUrl(sessionId) {
  const origin = window.location.origin;
  return `${origin}/s/${sessionId}`;
}

export const buildSessionUrl = getSessionUrl;

/**
 * Format bytes into human readable string
 * @param {number} bytes 
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format seconds into mm:ss
 * @param {number} totalSeconds 
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.floor(Math.max(0, totalSeconds) % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Session Expiry Timer with tick and expire callbacks
 */
export class SessionCountdownTimer {
  constructor(durationSeconds, callbacks = {}) {
    this.remaining = durationSeconds;
    this.onTick = callbacks.onTick || (() => {});
    this.onExpire = callbacks.onExpire || (() => {});
    this.intervalId = null;
  }

  start() {
    this.stop();
    this.onTick(formatTime(this.remaining), this.remaining);
    this.intervalId = window.setInterval(() => {
      this.remaining--;
      if (this.remaining <= 0) {
        this.stop();
        this.onTick('00:00', 0);
        this.onExpire();
      } else {
        this.onTick(formatTime(this.remaining), this.remaining);
      }
    }, 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset(durationSeconds) {
    this.remaining = durationSeconds;
    this.start();
  }
}

export const ExpiryTimer = SessionCountdownTimer;

/**
 * SessionManager
 * Central coordinator for active session state, 120s TTL expiry,
 * active memory buffers, Blob Object URLs, active network sockets,
 * and zero-trace memory purging.
 */
export class SessionManager {
  constructor() {
    this.sessionId = null;
    this.sessionUrl = null;
    this.expiresAt = 0;
    this.countdownTimer = null;
    this.activeBuffers = new Set();
    this.objectUrls = new Set();
    this.activeSockets = new Set();
    this.registeredCleanups = new Set();
    this.transferHistory = [];
    this.isPurged = false;
  }

  /**
   * Initialize a new session lifecycle
   * @param {string} sessionId 
   * @param {number} [durationSeconds=120] 
   * @param {(formatted: string, remaining: number) => void} [onTick] 
   * @param {() => void} [onExpire] 
   * @returns {SessionManager}
   */
  initSession(sessionId, durationSeconds = 120, onTick = null, onExpire = null) {
    this.purgeAll();
    this.isPurged = false;
    this.sessionId = sessionId;
    this.sessionUrl = buildSessionUrl(sessionId);
    this.expiresAt = Date.now() + (durationSeconds * 1000);

    this.countdownTimer = new SessionCountdownTimer(durationSeconds, {
      onTick: (formattedTime, remainingSec) => {
        if (onTick) onTick(formattedTime, remainingSec);
      },
      onExpire: () => {
        this.onSessionExpired();
        if (onExpire) onExpire();
      }
    });
    this.countdownTimer.start();
    return this;
  }

  /**
   * Track in-memory chunk arrays or ArrayBuffers
   * @param {any[]|ArrayBuffer|Uint8Array} buffer 
   * @returns {any}
   */
  registerBuffer(buffer) {
    if (buffer) {
      this.activeBuffers.add(buffer);
    }
    return buffer;
  }

  /**
   * Track created Blob Object URLs for automatic revocation
   * @param {string} url 
   * @returns {string}
   */
  registerBlobUrl(url) {
    if (url && typeof url === 'string') {
      this.objectUrls.add(url);
    }
    return url;
  }

  /**
   * Track active WebSocket or signalling instances
   * @param {any} socket 
   */
  registerSocket(socket) {
    if (socket) {
      this.activeSockets.add(socket);
    }
  }

  /**
   * Unregister a socket instance
   * @param {any} socket 
   */
  unregisterSocket(socket) {
    if (socket) {
      this.activeSockets.delete(socket);
    }
  }

  /**
   * Register a custom cleanup callback (e.g. from app UI or transfer manager)
   * @param {(reason: string) => void} callback 
   */
  registerCleanup(callback) {
    if (typeof callback === 'function') {
      this.registeredCleanups.add(callback);
    }
  }

  /**
   * Remove a registered cleanup callback
   * @param {Function} callback 
   */
  unregisterCleanup(callback) {
    this.registeredCleanups.delete(callback);
  }

  /**
   * Record a transferred item in ephemeral recent transfers list (max 3)
   * @param {object} item 
   * @returns {object[]}
   */
  recordTransfer(item) {
    if (item && item.objectUrl) {
      this.registerBlobUrl(item.objectUrl);
    }
    this.transferHistory.unshift(item);
    if (this.transferHistory.length > 3) {
      const removed = this.transferHistory.pop();
      if (removed && removed.objectUrl) {
        this.revokeBlobUrl(removed.objectUrl);
      }
    }
    return this.transferHistory;
  }

  /**
   * Revoke an individual Blob Object URL
   * @param {string} url 
   */
  revokeBlobUrl(url) {
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
      this.objectUrls.delete(url);
    }
  }

  /**
   * Clear all active chunk buffers and revoke all Blob Object URLs
   */
  clearBuffers() {
    // Release and wipe chunk arrays & typed byte buffers
    for (const buf of this.activeBuffers) {
      try {
        if (Array.isArray(buf)) {
          buf.length = 0;
        } else if (buf instanceof ArrayBuffer) {
          // Zero out if view is possible
          const view = new Uint8Array(buf);
          view.fill(0);
        } else if (ArrayBuffer.isView(buf)) {
          buf.fill(0);
        }
      } catch (e) {}
    }
    this.activeBuffers.clear();

    // Revoke all Blob Object URLs
    for (const url of this.objectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }
    this.objectUrls.clear();
  }

  /**
   * Handler triggered when connection drops or is interrupted
   */
  onConnectionLost() {
    console.log('[SessionManager] Connection lost: clearing transient buffers');
    this.clearBuffers();
    this.runCleanups('connection-lost');
  }

  /**
   * Handler triggered when 120s session window expires
   */
  onSessionExpired() {
    console.log('[SessionManager] Session expired: purging buffers, stopping timers, closing sockets');
    this.clearBuffers();
    if (this.countdownTimer) {
      this.countdownTimer.stop();
      this.countdownTimer = null;
    }
    this.closeSockets();
    this.runCleanups('session-expired');
    this.sessionId = null;
    this.sessionUrl = null;
    this.expiresAt = 0;
  }

  /**
   * Gracefully close all registered active sockets
   */
  closeSockets() {
    for (const ws of this.activeSockets) {
      try {
        if (ws.close) ws.close(1000, 'Session purged or expired');
      } catch (e) {}
    }
    this.activeSockets.clear();
  }

  /**
   * Execute all registered cleanup callbacks
   * @param {string} reason 
   */
  runCleanups(reason) {
    for (const cleanup of this.registeredCleanups) {
      try {
        cleanup(reason);
      } catch (e) {
        console.warn('[SessionManager] Cleanup callback error:', e);
      }
    }
  }

  /**
   * Complete memory purge and state reset.
   * Called by the 'btnPanicRevoke' handler to ensure zero traces of
   * transferred data or files remain in browser memory.
   */
  purgeAll() {
    this.isPurged = true;
    console.log('[SessionManager] purgeAll() executed: Zeroing memory, revoking Object URLs, destroying sockets');

    // 1. Stop countdown timer
    if (this.countdownTimer) {
      this.countdownTimer.stop();
      this.countdownTimer = null;
    }

    // 2. Clear all active chunk buffers and revoke registered Blob URLs
    this.clearBuffers();

    // 3. Clear recent transfer memory and revoke any dangling URLs
    for (const item of this.transferHistory) {
      if (item && item.objectUrl) {
        try { URL.revokeObjectURL(item.objectUrl); } catch (e) {}
      }
    }
    this.transferHistory = [];

    // 4. Close all active sockets
    this.closeSockets();

    // 5. Run registered cleanups
    this.runCleanups('purge');

    // 6. Reset all identifiers
    this.sessionId = null;
    this.sessionUrl = null;
    this.expiresAt = 0;
  }
}

export const sessionManager = new SessionManager();
