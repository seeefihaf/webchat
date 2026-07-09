const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const ExifParser = require('exif-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const clients = new Map();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function parseImageDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== 'string') return null;
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { mimeType, buffer, base64 };
}

function getImageLocation(buffer) {
  try {
    const parsed = ExifParser.create(buffer).parse();
    const latitude = parsed?.tags?.GPSLatitude;
    const longitude = parsed?.tags?.GPSLongitude;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
    return { latitude, longitude };
  } catch (e) {
    return null;
  }
}

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
    } else if (data.type === 'image') {
      const meta = clients.get(ws) || {};
      const sender = meta.name || 'Anonymous';
      const parsed = parseImageDataUrl(data.imageDataUrl);
      if (!parsed) return;
      const location = getImageLocation(parsed.buffer);
      const msg = {
        type: 'image',
        name: sender,
        mimeType: parsed.mimeType,
        imageDataUrl: `data:${parsed.mimeType};base64,${parsed.base64}`,
        location,
        ts: Date.now()
      };
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
