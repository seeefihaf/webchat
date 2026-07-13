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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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

function parseJsonObject(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e2) {
      return null;
    }
  }
}

async function getSmartImageLocation(imageDataUrl) {
  if (!OPENAI_API_KEY || typeof fetch !== 'function') return null;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content: 'You estimate likely photo location from visual clues. Return strict JSON with keys: summary (string), confidence (0..1 number), latitude (number|null), longitude (number|null), country (string|null).'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Estimate where this image was likely taken. If uncertain, keep confidence low.' },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ]
      })
    });

    if (!response.ok) return { summary: 'Smart estimate unavailable', confidence: 0 };
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = parseJsonObject(content);
    if (!parsed) return { summary: 'Smart estimate unavailable', confidence: 0 };

    const summary = typeof parsed.summary === 'string' ? parsed.summary : 'Smart estimate unavailable';
    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
    const latitude = Number.isFinite(Number(parsed.latitude)) ? Number(parsed.latitude) : null;
    const longitude = Number.isFinite(Number(parsed.longitude)) ? Number(parsed.longitude) : null;
    const country = typeof parsed.country === 'string' ? parsed.country : null;

    return { summary, confidence, latitude, longitude, country };
  } catch (e) {
    return { summary: 'Smart estimate unavailable', confidence: 0 };
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

  ws.on('message', async (raw) => {
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
      const smartLocation = location ? null : await getSmartImageLocation(`data:${parsed.mimeType};base64,${parsed.base64}`);
      const msg = {
        type: 'image',
        name: sender,
        mimeType: parsed.mimeType,
        imageDataUrl: `data:${parsed.mimeType};base64,${parsed.base64}`,
        location,
        smartLocation,
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
