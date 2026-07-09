const express = require('express');
const path = require('path');
const multer = require('multer');
const exifr = require('exifr');

const app = express();

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

    let location = null;
    let warning = null;
    try {
      location = await reverseGeocode(latitude, longitude);
    } catch (_err) {
      warning = 'Coordinates found, but reverse geocoding is currently unavailable.';
    }

    res.json({
      found: true,
      latitude,
      longitude,
      mapUrl,
      location,
      warning
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
