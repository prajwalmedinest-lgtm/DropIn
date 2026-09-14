import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { SignallingManager } from './server/signalling';

const PORT = 3000;
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const signalling = new SignallingManager();
  let viteDevServer: any = null;

  // Attach WebSocket server for signalling on /ws with clean upgrade handling
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => {
    signalling.handleConnection(ws);
  });
  wss.on('error', (err) => {
    console.warn('[WSS] WebSocketServer error:', err?.message || err);
  });

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {
      // Gracefully handle any premature client TCP teardowns
    });

    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws' || url.pathname.startsWith('/ws')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else if (viteDevServer && viteDevServer.ws) {
        // Delegate Vite's internal development HMR WebSocket upgrades
        viteDevServer.ws.handleUpgrade(request, socket, head);
      } else {
        // Cleanly close socket for non-/ws paths without throwing
        socket.destroy();
      }
    } catch (e) {
      socket.destroy();
    }
  });

  app.use(express.json());

  // API endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.post('/api/session/create', (req, res) => {
    const id = req.body?.id || Math.random().toString(36).substring(2, 14);
    const session = signalling.createSession(id, 120);
    res.json({ sessionId: session.id, expiresAt: session.expiresAt });
  });

  app.get('/api/session/:id', (req, res) => {
    const session = signalling.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    res.json({
      sessionId: session.id,
      expiresAt: session.expiresAt,
      status: session.status,
      receiverConnected: Boolean(session.receiverWs),
      senderConnected: Boolean(session.senderWs)
    });
  });

  // Direct shortlink route: /s/:id -> redirects to mobile sender with session parameter
  app.get('/s/:id', (req, res) => {
    res.redirect(`/send.html?s=${encodeURIComponent(req.params.id)}`);
  });

  // In production, serve dist assets
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));

    app.get('/send.html', (req, res) => {
      res.sendFile(path.join(distPath, 'send.html'));
    });

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // In development, hook up Vite dev server and middlewares
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'custom',
    });
    viteDevServer = vite;
    app.use(vite.middlewares);

    app.get('/', async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });

    app.get('/send.html', async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.resolve(process.cwd(), 'send.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`DropIn server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
