# DropIn ✦

**Scan. Select. Attached.**

DropIn is a high-speed, zero-friction cross-device file transfer web application built with vanilla web technologies, Node.js, WebSockets, and WebRTC. It pairs a phone directly to a laptop via a dynamic QR code and transfers files over a direct P2P memory stream with automated cryptographic integrity verification and zero server-side file retention.

---

## 🌟 Highlights & Features

- **Zero Accounts & Zero Sign-in**: No apps to download, no accounts to create, and no email or phone numbers needed.
- **Instant QR Pairing**: High-contrast QR codes generated directly in the browser canvas for instant mobile pairing.
- **Multi-File Sequential Queuing**: Select or capture multiple files and photos; they transfer sequentially over the active session without requiring you to re-scan.
- **Mobile Camera & Photo Resilience**: Seamless photo capture with intelligent tab-suspension recovery (`visibilitychange`/`pageshow`) ensuring the mobile connection remains active when returning from the camera app.
- **Direct WebRTC Memory Streaming**: High-throughput P2P DataChannel chunk streaming with adaptive 64 KB flow control.
- **Reliable Fallback Relay**: Ephemeral WebSocket relay automatically takes over if strict corporate firewalls or carrier NATs block direct P2P connections.
- **SHA-256 Cryptographic Verification**: Computes real-time checksums during streaming and validates file integrity on reception.
- **120-Second Ephemeral Lifecycle**: Sessions auto-expire after 2 minutes with a synchronized countdown ring and progress bar around the QR viewfinder.
- **Panic Wipe**: One-click instant memory purge that terminates WebRTC peer connections, closes WebSockets, revokes Object URLs, and cleans memory.
- **Celestial Visual Identity & Star Performance Manager**: Micro-interactive starry animations optimized with dynamic frame throttling during active high-speed transfers.

---

## 🏗️ Architecture & Transfer Flow

```
┌──────────────────────────────┐              ┌──────────────────────────────┐
│       Laptop (Receiver)      │              │         Phone (Sender)       │
│         /index.html          │              │          /send.html          │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               │─────────── 1. Create Session ───────────────│
               │   (Random 12-char ID, 120s TTL)             │
               │                                             │
               │─── 2. Display Dynamic QR Code ──────────────│
               │                                             │
               │                                3. Scan QR Code & Join
               │                                   /s/{sessionId}
               │                                             │
               │◄──────── 4. WebRTC SDP / ICE Exchange ─────►│
               │          via Ephemeral Signalling (/ws)     │
               │                                             │
               │◄════════ 5. Direct WebRTC DataChannel ═════►│
               │          (64 KB Chunks + Flow Control)      │
               │          [Fallback: Ephemeral WS Relay]     │
               │                                             │
               │◄──────── 6. File & SHA-256 Checksum ────────│
               │                                             │
               │─── 7. Client-side Blob Reassembly ──────────│
               │       & Instant Single-Click Download       │
               │                                             │
               │◄──────── 8. Sequential Queue Next File ────►│
               │          (No Re-scanning Required)          │
```

---

## 📁 Repository Structure

```
├── index.html            # Desktop receiver view (QR display, progress meter, download vault)
├── send.html             # Mobile sender view (Camera picker, multi-file queue, transfer progress)
├── vercel.json           # Dynamic routing rules for /s/:id shortlinks on static/edge hosts
├── css/
│   ├── global.css        # Theme variables, typography & layout resets
│   ├── components.css    # Cards, QR viewfinder, progress rings, queue lists & buttons
│   └── animations.css    # Micro-interactions, celestial twinkling & progress transitions
├── js/
│   ├── app.js            # Desktop receiver controller & state machine
│   ├── sender.js         # Mobile sender controller & sequential transfer manager
│   ├── session.js        # Ephemeral session IDs, URL formatting, and timers
│   ├── qr.js             # High-contrast canvas QR code generator
│   ├── transfer.js       # WebRTC DataChannel manager, chunk streamer & flow control
│   ├── signalling-client.js # Ephemeral WebSocket client with auto-reconnect
│   ├── audio-feedback.js # Web Audio API sound synthesis for pairing & completion
│   ├── file-icons.js     # Adaptive MIME-type badge rendering
│   └── star-performance-manager.js # Real-time GPU & animation throttling
├── server/
│   └── signalling.ts     # Ephemeral session discovery & WebRTC SDP relay manager
├── server.ts             # Express HTTP + WebSocket server entry point (Port 3000)
├── package.json          # Project metadata & build scripts
├── tsconfig.json         # TypeScript configuration
└── vite.config.ts        # Vite build & asset configuration
```

---

## ⚡ Getting Started & Deployment

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** or **bun** / **yarn**

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-username/dropin.git

# Navigate into project directory
cd dropin

# Install dependencies
npm install

# Start development server
npm run dev
```
Open your browser at `http://localhost:3000` to view the desktop interface. To test mobile transfer locally on the same Wi-Fi network, access your computer's local IP address (e.g. `http://192.168.1.X:3000`) or use the displayed QR code.

### Standalone Production Build (Node.js / Docker / Cloud Run)

```bash
npm run build
npm start
```
The compiled bundle will be outputted to `dist/` and served as a standalone, production-ready full-stack application on port 3000 with WebRTC signalling on `/ws`.

### Vercel Deployment

A `vercel.json` configuration is included at the root of the repository. When deploying to Vercel, the routing rules automatically map shortlinks (`/s/:id`) directly to `send.html?s=:id` and route static SPA fallbacks cleanly without 404 errors.

---

## 🔒 Security & Privacy

1. **Zero Server Storage**: Files and photos are streamed directly between connected browser memory buffers. The backend server never writes or persists file content to disk.
2. **Ephemeral Sessions**: Sessions automatically self-destruct after 120 seconds.
3. **End-to-End Cryptographic Checksum**: SHA-256 hashes are calculated on-the-fly and verified before blobs are saved.
4. **Instant Panic Wipe**: Instantly drops all connections, destroys active blobs, and resets the interface.

---

## 📄 License

MIT License. Feel free to use, modify, and distribute.
