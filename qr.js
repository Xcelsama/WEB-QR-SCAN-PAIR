const express = require('express');
const QRCode = require('qrcode');
const { startLink, allow, keepAlive } = require('./session');

const router = express.Router();

// GET /qr -> PNG of the first QR code. Linking continues in the background.
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!allow(req)) return res.status(429).json({ code: 'Too many attempts. Wait a few minutes.' });

  const { first, done } = startLink({ mode: 'qr' });
  keepAlive(done);
  try {
    const { qr } = await first;
    res.type('png').send(await QRCode.toBuffer(qr, { margin: 1, width: 360 }));
  } catch {
    res.status(503).json({ code: 'Service Unavailable' });
  }
});

module.exports = router;
