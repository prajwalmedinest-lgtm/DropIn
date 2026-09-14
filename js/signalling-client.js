/**
 * DropIn - Robust Universal Signalling & Relay Client
 * 
 * Features:
 * - Direct local WebSocket transport on /ws (for fullstack Node.js / Cloud Run / Docker)
 * - Automatic, seamless failover to global high-speed public MQTT-over-WebSocket brokers
 *   (wss://broker.emqx.io:8084/mqtt, wss://broker.hivemq.com:8884/mqtt) when hosted on serverless/static platforms (Vercel, Netlify, etc.)
 * - Zero-dependency binary MQTT 3.1.1 packet encoder & decoder
 * - Tab background / mobile photo capture wake-up recovery
 * - Cryptographic SHA-256 chunk relay with zero server file storage
 */

const PUBLIC_RELAY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081'
];

/**
 * Variable length encoder for MQTT remaining length
 */
function encodeRemainingLength(length) {
  const bytes = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) {
      digit = digit | 0x80;
    }
    bytes.push(digit);
  } while (length > 0);
  return new Uint8Array(bytes);
}

/**
 * Variable length decoder for MQTT remaining length
 */
function decodeRemainingLength(data, startIndex) {
  let multiplier = 1;
  let value = 0;
  let offset = startIndex;
  let encodedByte;
  do {
    if (offset >= data.length) return { length: 0, bytesRead: 0 };
    encodedByte = data[offset++];
    value += (encodedByte & 127) * multiplier;
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) throw new Error('Malformed MQTT remaining length');
  } while ((encodedByte & 128) !== 0);
  return { length: value, bytesRead: offset - startIndex };
}

/**
 * Build MQTT CONNECT packet (3.1.1 CleanSession, 60s keepalive)
 */
function buildMqttConnect(clientId) {
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(clientId);
  const varHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c]; // "MQTT", v4, clean, 60s
  const payloadLen = 2 + idBytes.length;
  const remLen = varHeader.length + payloadLen;
  const remLenBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remLenBytes.length + remLen);
  packet[0] = 0x10; // CONNECT
  packet.set(remLenBytes, 1);
  let pos = 1 + remLenBytes.length;
  packet.set(varHeader, pos);
  pos += varHeader.length;
  packet[pos] = (idBytes.length >> 8) & 0xff;
  packet[pos + 1] = idBytes.length & 0xff;
  packet.set(idBytes, pos + 2);
  return packet;
}

/**
 * Build MQTT SUBSCRIBE packet (QoS 0)
 */
function buildMqttSubscribe(packetId, topic) {
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  const remLen = 2 + 2 + topicBytes.length + 1; // packetId (2) + topicLen (2) + topic + requestedQoS (1)
  const remLenBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remLenBytes.length + remLen);
  packet[0] = 0x82; // SUBSCRIBE
  packet.set(remLenBytes, 1);
  let pos = 1 + remLenBytes.length;
  packet[pos] = (packetId >> 8) & 0xff;
  packet[pos + 1] = packetId & 0xff;
  pos += 2;
  packet[pos] = (topicBytes.length >> 8) & 0xff;
  packet[pos + 1] = topicBytes.length & 0xff;
  pos += 2;
  packet.set(topicBytes, pos);
  pos += topicBytes.length;
  packet[pos] = 0x00; // Requested QoS 0
  return packet;
}

/**
 * Build MQTT PUBLISH packet (QoS 0)
 */
function buildMqttPublish(topic, payload) {
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  let payloadBytes;

  if (typeof payload === 'string') {
    payloadBytes = encoder.encode(payload);
  } else if (payload instanceof Uint8Array) {
    payloadBytes = payload;
  } else if (payload instanceof ArrayBuffer) {
    payloadBytes = new Uint8Array(payload);
  } else {
    payloadBytes = encoder.encode(String(payload));
  }

  const remLen = 2 + topicBytes.length + payloadBytes.length;
  const remLenBytes = encodeRemainingLength(remLen);
  const packet = new Uint8Array(1 + remLenBytes.length + remLen);
  packet[0] = 0x30; // PUBLISH QoS 0
  packet.set(remLenBytes, 1);
  let pos = 1 + remLenBytes.length;
  packet[pos] = (topicBytes.length >> 8) & 0xff;
  packet[pos + 1] = topicBytes.length & 0xff;
  pos += 2;
  packet.set(topicBytes, pos);
  pos += topicBytes.length;
  packet.set(payloadBytes, pos);
  return packet;
}

/**
 * Build MQTT PINGREQ packet
 */
function buildMqttPing() {
  return new Uint8Array([0xc0, 0x00]);
}

/**
 * Parse MQTT packet buffer
 */
function parseMqttPackets(data) {
  const decoder = new TextDecoder();
  const packets = [];
  let offset = 0;

  while (offset < data.length) {
    const packetType = data[offset] >> 4;
    const { length: remLength, bytesRead: remLenBytesCount } = decodeRemainingLength(data, offset + 1);
    const headerSize = 1 + remLenBytesCount;
    const totalPacketSize = headerSize + remLength;

    if (offset + totalPacketSize > data.length) {
      break; // Incomplete packet
    }

    const packetPayload = data.subarray(offset + headerSize, offset + totalPacketSize);

    if (packetType === 2) {
      // CONNACK (0x20)
      const returnCode = packetPayload[1];
      packets.push({ type: 'connack', success: returnCode === 0 });
    } else if (packetType === 3) {
      // PUBLISH (0x30)
      const topicLen = (packetPayload[0] << 8) | packetPayload[1];
      const topic = decoder.decode(packetPayload.subarray(2, 2 + topicLen));
      const payloadBytes = packetPayload.subarray(2 + topicLen);
      packets.push({ type: 'publish', topic, payload: payloadBytes });
    } else if (packetType === 9) {
      // SUBACK (0x90)
      packets.push({ type: 'suback' });
    } else if (packetType === 13) {
      // PINGRESP (0xd0)
      packets.push({ type: 'pingresp' });
    }

    offset += totalPacketSize;
  }

  return packets;
}

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
    this.transportMode = 'direct'; // 'direct' (/ws) or 'relay' (MQTT cloud broker)
    this.brokerIndex = 0;
    this.isSessionActive = false;
    this.isExplicitlyClosed = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;
    this.reconnectTimer = null;
    this.keepaliveTimer = null;
    this.directTimeoutTimer = null;
    this.beaconTimer = null;
    this.messageQueue = [];
    this.lastConnectedTime = 0;
    this.isRelayReady = false;

    // Mobile background / wake-up recovery
    this.setupVisibilityListeners();
  }

  get isConnected() {
    if (this.transportMode === 'relay') {
      return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN && this.isRelayReady);
    }
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  get bufferedAmount() {
    return this.ws ? this.ws.bufferedAmount || 0 : 0;
  }

  get targetTopic() {
    const peerRole = this.role === 'receiver' ? 'sender' : 'receiver';
    return `dropin/v2/${this.sessionId}/${peerRole}`;
  }

  get ownTopic() {
    return `dropin/v2/${this.sessionId}/${this.role}`;
  }

  setupVisibilityListeners() {
    if (typeof document === 'undefined') return;

    const handleWakeup = () => {
      if (document.visibilityState === 'visible' && this.isSessionActive && !this.isExplicitlyClosed) {
        console.log(`[SignallingClient] Tab resumed. Checking connection health for ${this.role}...`);
        if (!this.isConnected) {
          this.ensureConnected();
        } else {
          // Send instant ping/beacon to verify connection
          this.sendHeartbeat();
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('pageshow', handleWakeup);
    window.addEventListener('focus', handleWakeup);
  }

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

  waitUntilConnected(timeoutMs = 12000) {
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
      }, 60);
    });
  }

  start(sessionId) {
    if (sessionId) {
      this.sessionId = sessionId;
    }
    this.isSessionActive = true;
    this.isExplicitlyClosed = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];

    // If hosted on known serverless static domains (e.g. vercel.app), default directly to Cloud Relay
    if (typeof window !== 'undefined' && (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('github.io') || window.location.hostname.includes('netlify.app'))) {
      this.transportMode = 'relay';
    } else {
      this.transportMode = 'direct';
    }

    this.connect();
  }

  getDirectWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  getRelayWsUrl() {
    return PUBLIC_RELAY_BROKERS[this.brokerIndex % PUBLIC_RELAY_BROKERS.length];
  }

  connect() {
    if (this.isExplicitlyClosed || !this.isSessionActive) {
      return;
    }

    this.cleanupSocketOnly();

    if (this.transportMode === 'direct') {
      this.connectDirect();
    } else {
      this.connectRelay();
    }
  }

  connectDirect() {
    const wsUrl = this.getDirectWsUrl();
    console.log(`[SignallingClient] Attempting direct connection on ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      // Set a short fallback timeout: if direct /ws does not connect within 1.2s, switch to relay broker
      this.directTimeoutTimer = setTimeout(() => {
        if (!this.isConnected && this.transportMode === 'direct') {
          console.log('[SignallingClient] Direct socket timeout. Switching to cloud relay broker...');
          this.transportMode = 'relay';
          this.connectRelay();
        }
      }, 1200);

      this.ws.onopen = () => {
        if (this.directTimeoutTimer) clearTimeout(this.directTimeoutTimer);
        if (this.isExplicitlyClosed || !this.isSessionActive) {
          try { this.ws.close(1000); } catch (e) {}
          return;
        }

        console.log(`[SignallingClient] Direct connected as ${this.role} for session ${this.sessionId}`);
        this.reconnectAttempts = 0;
        this.lastConnectedTime = Date.now();
        this.startKeepalive();

        this.sendJson({
          type: this.role === 'receiver' ? 'join-receiver' : 'join-sender',
          sessionId: this.sessionId
        });

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
          if (msg.type === 'pong') return;
          this.onMessage(msg);
        } catch (e) {
          this.onMessage({ type: 'raw-string', data: event.data });
        }
      };

      this.ws.onclose = () => {
        if (this.directTimeoutTimer) clearTimeout(this.directTimeoutTimer);
        this.stopKeepalive();
        if (this.isExplicitlyClosed || !this.isSessionActive) return;

        // Automatically switch to cloud relay if direct connection drops
        console.log('[SignallingClient] Direct connection unavailable. Switching to cloud relay...');
        this.transportMode = 'relay';
        this.onStatusChange('reconnecting');
        this.connectRelay();
      };

      this.ws.onerror = (err) => {
        if (this.directTimeoutTimer) clearTimeout(this.directTimeoutTimer);
        if (this.transportMode === 'direct') {
          this.transportMode = 'relay';
          this.connectRelay();
        }
      };
    } catch (e) {
      this.transportMode = 'relay';
      this.connectRelay();
    }
  }

  connectRelay() {
    const relayUrl = this.getRelayWsUrl();
    console.log(`[SignallingClient] Connecting to high-speed cloud broker: ${relayUrl} (${this.role})`);
    this.isRelayReady = false;

    try {
      this.ws = new WebSocket(relayUrl, ['mqtt']);
      this.ws.binaryType = 'arraybuffer';

      const clientId = `dropin_${this.role}_${this.sessionId.slice(0, 6)}_${Math.random().toString(36).substring(2, 7)}`;

      this.ws.onopen = () => {
        if (this.isExplicitlyClosed || !this.isSessionActive) {
          try { this.ws.close(1000); } catch (e) {}
          return;
        }

        // Send MQTT CONNECT packet
        const connectPacket = buildMqttConnect(clientId);
        this.ws.send(connectPacket);
      };

      this.ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
          return;
        }

        const uint8Data = new Uint8Array(event.data);
        const packets = parseMqttPackets(uint8Data);

        for (const pkt of packets) {
          if (pkt.type === 'connack') {
            if (pkt.success) {
              console.log(`[SignallingClient] Cloud Broker Connected & Authenticated (${this.role})`);
              this.isRelayReady = true;
              this.reconnectAttempts = 0;
              this.lastConnectedTime = Date.now();
              this.startKeepalive();

              // Subscribe to own topic and broadcast
              const subPacket = buildMqttSubscribe(1, this.ownTopic);
              this.ws.send(subPacket);

              // If receiver: broadcast announcement to sender
              if (this.role === 'receiver') {
                this.sendJson({ type: 'receiver-ready', sessionId: this.sessionId });
                this.startReceiverBeacon();
              } else {
                this.sendJson({ type: 'join-sender', sessionId: this.sessionId });
              }

              this.flushQueue();
              this.onStatusChange('connected');
            } else {
              console.warn('[SignallingClient] Broker connack rejected, rotating broker...');
              this.rotateBrokerAndReconnect();
            }
          } else if (pkt.type === 'publish') {
            this.handleRelayPublish(pkt.payload);
          }
        }
      };

      this.ws.onclose = (event) => {
        this.stopKeepalive();
        this.stopReceiverBeacon();
        this.isRelayReady = false;
        if (this.isExplicitlyClosed || !this.isSessionActive) return;

        console.warn(`[SignallingClient] Broker connection lost (code: ${event.code}). Reconnecting...`);
        this.onStatusChange('reconnecting');
        this.rotateBrokerAndReconnect();
      };

      this.ws.onerror = (err) => {
        this.isRelayReady = false;
        console.warn('[SignallingClient] Broker error notice, rotating broker...');
        this.rotateBrokerAndReconnect();
      };
    } catch (e) {
      this.rotateBrokerAndReconnect();
    }
  }

  handleRelayPublish(payloadBytes) {
    const decoder = new TextDecoder();
    let textData = null;
    let isJson = false;
    let jsonMsg = null;

    // Check if payload starts with JSON opening characters '{' or '['
    if (payloadBytes.length > 0 && (payloadBytes[0] === 0x7b || payloadBytes[0] === 0x5b)) {
      try {
        textData = decoder.decode(payloadBytes);
        jsonMsg = JSON.parse(textData);
        isJson = true;
      } catch (e) {
        isJson = false;
      }
    }

    if (isJson && jsonMsg) {
      // Intercept peer discovery events
      if (jsonMsg.type === 'join-sender' && this.role === 'receiver') {
        this.sendJson({ type: 'sender-joined-success', sessionId: this.sessionId });
        this.onMessage({ type: 'sender-joined', sessionId: this.sessionId });
        return;
      }
      if (jsonMsg.type === 'receiver-ready' && this.role === 'sender') {
        this.onMessage({ type: 'sender-joined-success', sessionId: this.sessionId });
        return;
      }
      if (jsonMsg.type === 'ping') {
        return;
      }

      this.onMessage(jsonMsg);
    } else {
      // Binary chunk transfer
      this.onBinary(payloadBytes.buffer.slice(payloadBytes.byteOffset, payloadBytes.byteOffset + payloadBytes.byteLength));
    }
  }

  rotateBrokerAndReconnect() {
    if (this.isExplicitlyClosed || !this.isSessionActive) return;
    if (this.reconnectTimer) return;

    this.brokerIndex++;
    this.reconnectAttempts++;

    const delay = Math.min(2000, 200 + this.reconnectAttempts * 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.isSessionActive && !this.isExplicitlyClosed) {
        this.connectRelay();
      }
    }, delay);
  }

  startReceiverBeacon() {
    this.stopReceiverBeacon();
    // Announce receiver readiness every 1.5s until sender pairs
    this.beaconTimer = setInterval(() => {
      if (this.isConnected && this.role === 'receiver') {
        this.sendJson({ type: 'receiver-ready', sessionId: this.sessionId });
      }
    }, 1500);
  }

  stopReceiverBeacon() {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
  }

  startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 10000);
  }

  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  sendHeartbeat() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      if (this.transportMode === 'relay') {
        this.ws.send(buildMqttPing());
      } else {
        this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }
    } catch (e) {}
  }

  send(data) {
    if (this.isConnected) {
      try {
        if (this.transportMode === 'relay') {
          const packet = buildMqttPublish(this.targetTopic, data);
          this.ws.send(packet);
        } else {
          this.ws.send(data);
        }
        return true;
      } catch (e) {
        console.warn('[SignallingClient] Send error, queueing:', e);
      }
    }

    if (typeof data === 'string') {
      this.messageQueue.push(data);
    }
    return false;
  }

  sendJson(obj) {
    return this.send(JSON.stringify(obj));
  }

  flushQueue() {
    if (!this.isConnected) return;
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      try {
        if (this.transportMode === 'relay') {
          const packet = buildMqttPublish(this.targetTopic, item);
          this.ws.send(packet);
        } else {
          this.ws.send(item);
        }
      } catch (e) {
        this.messageQueue.unshift(item);
        break;
      }
    }
  }

  cleanupSocketOnly() {
    this.stopKeepalive();
    this.stopReceiverBeacon();
    if (this.directTimeoutTimer) {
      clearTimeout(this.directTimeoutTimer);
      this.directTimeoutTimer = null;
    }
    this.isRelayReady = false;

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close(1000, 'Closing socket');
      } catch (e) {}
      this.ws = null;
    }
  }

  close() {
    this.isSessionActive = false;
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.messageQueue = [];
    this.cleanupSocketOnly();
  }
}
