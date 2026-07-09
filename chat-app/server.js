const express = require('express');
const path = require('path');
const multer = require('multer');
const exifr = require('exifr');

const app = express();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_AI_IMAGE_BYTES = 2_500_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image files are supported.'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

async function reverseGeocode(latitude, longitude) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Beacon/1.0 (osint image geolocation app)',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}`);
  }

  const data = await response.json();
  return {
    displayName: data.display_name || null,
    address: data.address || null
  };
}

function buildStreetViewUrl(latitude, longitude) {
  const url = new URL('https://www.google.com/maps/@');
  url.searchParams.set('api', '1');
  url.searchParams.set('map_action', 'pano');
  url.searchParams.set('viewpoint', `${latitude},${longitude}`);
  return url.toString();
}

function parseJsonSafely(raw) {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

async function runSingleAIVerification({ imageBuffer, mimeType, latitude, longitude, locationName, pass }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const imageBase64 = imageBuffer.toString('base64');
    const prompt = [
      `Verification pass ${pass} of 3.`,
      'Analyze the uploaded image and decide whether it plausibly matches the provided location.',
      `Coordinates: ${latitude}, ${longitude}.`,
      `Location: ${locationName || 'Unknown address'}.`,
      'Return strict JSON only with keys: match (boolean), confidence (number 0-1), reason (string).',
      'Use visual cues and geographic plausibility; be conservative.'
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are a precise OSINT image geolocation verifier.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'beacon_location_match',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                match: { type: 'boolean' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                reason: { type: 'string' }
              },
              required: ['match', 'confidence', 'reason'],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`AI verification request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? parseJsonSafely(content) : null;

    if (!parsed || typeof parsed.match !== 'boolean' || typeof parsed.confidence !== 'number') {
      throw new Error('AI verification response could not be parsed.');
    }

    return {
      pass,
      ok: true,
      match: parsed.match,
      confidence: parsed.confidence,
      reason: parsed.reason || 'No reason provided'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runThreePassAIVerification({ imageBuffer, mimeType, latitude, longitude, locationName }) {
  if (!OPENAI_API_KEY) {
    return {
      available: false,
      warning: 'OPENAI_API_KEY is not configured; AI 3-pass verification skipped.',
      attempts: []
    };
  }

  if (!imageBuffer || imageBuffer.length > MAX_AI_IMAGE_BYTES) {
    return {
      available: false,
      warning: 'Image too large for AI verification; only metadata checks were performed.',
      attempts: []
    };
  }

  const attempts = [];
  for (let pass = 1; pass <= 3; pass += 1) {
    try {
      const result = await runSingleAIVerification({
        imageBuffer,
        mimeType: mimeType || 'image/jpeg',
        latitude,
        longitude,
        locationName,
        pass
      });
      attempts.push(result);
    } catch (err) {
      attempts.push({
        pass,
        ok: false,
        match: false,
        confidence: 0,
        reason: (err && err.message) ? err.message : 'AI check failed'
      });
    }
  }

  const successful = attempts.filter((a) => a.ok);
  const positive = successful.filter((a) => a.match).length;
  const averageConfidence = successful.length
    ? successful.reduce((sum, a) => sum + a.confidence, 0) / successful.length
    : 0;

  return {
    available: true,
    model: OPENAI_MODEL,
    attempts,
    summary: {
      successfulPasses: successful.length,
      passesRequested: 3,
      positivePasses: positive,
      matchedMajority: positive >= 2,
      averageConfidence: Number(averageConfidence.toFixed(3))
    }
  };
}

app.post('/api/locate', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Please upload an image file.' });
      return;
    }

    const gps = await exifr.gps(req.file.buffer);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      res.status(422).json({ error: 'No GPS metadata was found in this image.' });
      return;
    }

    const latitude = gps.latitude;
    const longitude = gps.longitude;
    const mapUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
    const streetViewUrl = buildStreetViewUrl(latitude, longitude);

    let location = null;
    let warning = null;
    try {
      location = await reverseGeocode(latitude, longitude);
    } catch (_err) {
      warning = 'Coordinates found, but reverse geocoding is currently unavailable.';
    }

    const aiVerification = await runThreePassAIVerification({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      latitude,
      longitude,
      locationName: location?.displayName || null
    });

    res.json({
      found: true,
      latitude,
      longitude,
      mapUrl,
      streetViewUrl,
      location,
      warning,
      aiVerification
    });
  } catch (err) {
    if (err && err.message && err.message.includes('Only image files are supported.')) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Image is too large. Max size is 10MB.' });
      return;
    }
    res.status(500).json({ error: 'Failed to process image metadata.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Beacon running on http://localhost:${PORT}`));
