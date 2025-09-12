const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const clients = new Map();

function broadcast(obj) {
  const raw = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(raw);
  });
}

wss.on('connection', (ws) => {
  clients.set(ws, { name: null });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (data.type === 'join') {
      const meta = clients.get(ws) || {};
      meta.name = (typeof data.name === 'string' && data.name.trim())
        ? data.name.trim()
        : 'Anonymous';
      clients.set(ws, meta);
      broadcast({ type: 'presence', event: 'joined', name: meta.name, ts: Date.now() });

    } else if (data.type === 'message') {
      const meta = clients.get(ws) || {};
      const sender = meta.name || 'Anonymous';
      const msg = { type: 'message', name: sender, text: String(data.text || ''), ts: Date.now() };
      broadcast(msg);
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (meta && meta.name) {
      broadcast({ type: 'presence', event: 'left', name: meta.name, ts: Date.now() });
    }
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
