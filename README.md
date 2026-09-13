# DropIn (V1)

**Scan. Select. Attached.**

DropIn is a zero-friction cross-device file transfer utility built with lightweight Vanilla HTML5, CSS3, and JavaScript. It connects your phone directly to your laptop via QR code and transfers files over WebRTC DataChannel (P2P direct) with an automatic ephemeral signalling fallback.

---

## 🚀 Core Features

- **Zero Accounts / Zero Sign-in**: Pair devices anonymously in seconds.
- **Cryptographic Ephemeral Sessions**: Random 12-character session IDs that expire automatically in 2 minutes.
- **Instant QR Pairing**: High-contrast QR codes generated directly in the browser canvas.
- **WebRTC DataChannel**: Direct browser-to-browser P2P file streaming with zero server-side file retention.
- **Seamless Relay Fallback**: Automatic WebSocket chunk streaming fallback if strict corporate or carrier NAT blocks P2P.
- **Camera Capture & File Picker**: Take photos on the fly or pick documents, PDFs, zips, and screenshots.
- **Real-time Transfer Meter**: Real-time progress bar, byte counter, and completion verification.
- **Single-Click Download**: Directly reconstructs binary Blobs on the laptop for immediate download.

---

## 🛠️ Architecture

```
Laptop (Receiver)                     Phone (Sender)
   index.html                           send.html
       │                                    │
       ├───────── WebSocket /ws ────────────┤
       │      (Signalling Discovery)        │
       │                                    │
       └◄═══════ WebRTC DataChannel ═══════►┘
               (P2P Chunked Transfer)
```

1. **Laptop** initiates a session → generates random `sessionId` (e.g. `7HFk29QmX82p`) and renders QR code.
2. **Phone** scans QR code → opens `https://domain/s/{sessionId}`.
3. **Signalling** coordinates SDP offer/answer exchange and ICE candidates over a shared ephemeral WebSocket.
4. **Data Transfer** runs across a WebRTC DataChannel with 64 KB chunks and buffered amount flow control.
5. **Reassembly** occurs client-side using `Blob` and temporary object URLs.

---

## 📁 Project Structure

```
├── index.html            # Desktop receiver view
├── send.html             # Mobile sender view
├── css/
│   ├── global.css        # Theme variables, typography & layout resets
│   ├── components.css    # Cards, QR frames, buttons, status pills & progress bars
│   └── animations.css    # Micro-interactions, transitions & pulse indicators
├── js/
│   ├── app.js            # Desktop receiver controller
│   ├── sender.js         # Mobile sender controller
│   ├── session.js        # Ephemeral session IDs, URL generation & timers
│   ├── qr.js             # High-contrast canvas QR code generator
│   └── transfer.js       # WebRTC DataChannel manager & chunk streamer
├── server/
│   └── signalling.ts     # Ephemeral session discovery & WebRTC signalling
└── server.ts             # Express + WebSocket HTTP server on port 3000
```
