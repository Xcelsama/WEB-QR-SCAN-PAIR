const express = require('express');
const { startLink, allow, keepAlive } = require('./session');

const router = express.Router();

// GET /code?number=2348012345678 -> { code: "ABCD-EFGH" }. Linking continues in the background.
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const number = String(req.query.number || '').replace(/\D/g, '');
  if (number.length < 8 || number.length > 15) return res.status(400).json({ code: 'Invalid number' });
  if (!allow(req)) return res.status(429).json({ code: 'Too many attempts. Wait a few minutes.' });

  const { first, done } = startLink({ mode: 'pair', number });
  keepAlive(done);
  try {
    const { code } = await first;
    res.json({ code });
  } catch {
    res.status(503).json({ code: 'Service Unavailable' });
  }
});

module.exports = router;
