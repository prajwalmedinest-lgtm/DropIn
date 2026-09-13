/**
 * DropIn - Ephemeral Signalling Server
 * Handles device discovery, WebRTC SDP/ICE exchange, and fallback relay.
 * No files are permanently stored. Sessions expire automatically.
 */
import { WebSocket } from 'ws';

interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  receiverWs: WebSocket | null;
  senderWs: WebSocket | null;
  status: 'waiting' | 'connected' | 'transferring' | 'completed' | 'expired';
}

export class SignallingManager {
  private sessions = new Map<string, Session>();
  private sweepInterval: NodeJS.Timeout;

  constructor() {
    // Periodically sweep expired sessions every 10 seconds
    this.sweepInterval = setInterval(() => {
      this.sweepExpiredSessions();
    }, 10000);
  }

  /**
   * Create a new ephemeral session (2 minute default expiration)
   */
  createSession(id: string, ttlSeconds: number = 120): Session {
    const now = Date.now();
    const session: Session = {
      id,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      receiverWs: null,
      senderWs: null,
      status: 'waiting'
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.closeSession(id, 'Session expired');
      return undefined;
    }
    return session;
  }

  /**
   * Handle incoming WebSocket connection
   */
  handleConnection(ws: WebSocket) {
    let currentSessionId: string | null = null;
    let currentRole: 'receiver' | 'sender' | null = null;

    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        // Fallback binary chunk relay
        if (currentSessionId && currentRole) {
          const session = this.getSession(currentSessionId);
          if (session) {
            const targetWs = currentRole === 'sender' ? session.receiverWs : session.senderWs;
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(data);
            }
          }
        }
        return;
      }

      try {
        const message = JSON.parse(data.toString());
        const { type, sessionId } = message;

        switch (type) {
          case 'join-receiver': {
            let session = this.getSession(sessionId);
            if (!session) {
              session = this.createSession(sessionId);
            }
            session.receiverWs = ws;
            currentSessionId = sessionId;
            currentRole = 'receiver';

            ws.send(JSON.stringify({
              type: 'receiver-joined',
              sessionId,
              expiresAt: session.expiresAt,
              hasSender: Boolean(session.senderWs && session.senderWs.readyState === WebSocket.OPEN)
            }));

            if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'sender-joined' }));
            }
            break;
          }

          case 'ping': {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
            break;
          }

          case 'join-sender': {
            const session = this.getSession(sessionId);
            if (!session) {
              ws.send(JSON.stringify({
                type: 'error',
                code: 'EXPIRED_OR_NOT_FOUND',
                message: 'Session has expired or does not exist.'
              }));
              return;
            }

            session.senderWs = ws;
            session.status = 'connected';
            currentSessionId = sessionId;
            currentRole = 'sender';

            ws.send(JSON.stringify({
              type: 'sender-joined-success',
              sessionId,
              expiresAt: session.expiresAt
            }));

            // Notify receiver that phone connected
            if (session.receiverWs && session.receiverWs.readyState === WebSocket.OPEN) {
              session.receiverWs.send(JSON.stringify({ type: 'sender-joined' }));
            }
            break;
          }

          case 'signal': {
            // Forward WebRTC SDP / ICE candidates directly to peer
            if (currentSessionId) {
              const session = this.getSession(currentSessionId);
              if (session) {
                const targetWs = currentRole === 'sender' ? session.receiverWs : session.senderWs;
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                  targetWs.send(JSON.stringify({
                    type: 'signal',
                    data: message.data
                  }));
                }
              }
            }
            break;
          }

          case 'file-selected': {
            if (currentSessionId) {
              const session = this.getSession(currentSessionId);
              if (session && session.receiverWs && session.receiverWs.readyState === WebSocket.OPEN) {
                session.receiverWs.send(JSON.stringify({
                  type: 'file-selected',
                  file: message.file
                }));
              }
            }
            break;
          }

          case 'relay-string': {
            // Fallback metadata / control string relay
            if (currentSessionId && currentRole) {
              const session = this.getSession(currentSessionId);
              if (session) {
                const targetWs = currentRole === 'sender' ? session.receiverWs : session.senderWs;
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                  targetWs.send(message.payload);
                }
              }
            }
            break;
          }

          case 'reset-session': {
            if (currentSessionId) {
              const session = this.getSession(currentSessionId);
              if (session) {
                session.status = 'connected';
                if (session.receiverWs && session.receiverWs.readyState === WebSocket.OPEN) {
                  session.receiverWs.send(JSON.stringify({ type: 'reset-complete' }));
                }
                if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
                  session.senderWs.send(JSON.stringify({ type: 'reset-complete' }));
                }
              }
            }
            break;
          }
        }
      } catch (e) {
        console.error('[Signalling] Message parse error:', e);
      }
    });

    ws.on('close', () => {
      if (currentSessionId && currentRole) {
        const session = this.sessions.get(currentSessionId);
        if (session) {
          if (currentRole === 'receiver' && session.receiverWs === ws) {
            session.receiverWs = null;
            if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
              session.senderWs.send(JSON.stringify({ type: 'receiver-disconnected' }));
            }
          } else if (currentRole === 'sender' && session.senderWs === ws) {
            session.senderWs = null;
            session.status = 'waiting';
            if (session.receiverWs && session.receiverWs.readyState === WebSocket.OPEN) {
              session.receiverWs.send(JSON.stringify({ type: 'sender-disconnected' }));
            }
          }
        }
      }
    });
  }

  private closeSession(sessionId: string, reason: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const payload = JSON.stringify({ type: 'session-expired', reason });
    if (session.receiverWs && session.receiverWs.readyState === WebSocket.OPEN) {
      session.receiverWs.send(payload);
    }
    if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
      session.senderWs.send(payload);
    }
    this.sessions.delete(sessionId);
  }

  private sweepExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.closeSession(id, 'Session expired due to TTL');
      }
    }
  }

  destroy() {
    clearInterval(this.sweepInterval);
    this.sessions.clear();
  }
}
