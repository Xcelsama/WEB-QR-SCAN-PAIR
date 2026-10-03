// Entry point. Vercel detects this file automatically (index.js + module.exports = app).
// Static pages live in public/ (Vercel serves that folder itself).
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8000;

app.use('/qr', require('./qr'));
app.use('/code', require('./pair'));

// Only used when running locally or on Render/Heroku; Vercel ignores express.static.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/pair', (_req, res) => res.redirect('/pair.html'));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Session site running on http://localhost:${PORT}`));
}
