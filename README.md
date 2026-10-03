# WEB-QR-SCAN-PAIR (updated for XLICON-MD)

QR and pairing-code session generator. The SESSION_ID is sent to the linked account's own
"Message yourself" chat as plain base64 of creds.json, which is exactly what XLICON-MD's
`SESSION_ID` expects (it runs `atob()` on it). Both use Baileys 7.0.0-rc14.

## Deploy on Vercel
1. Replace the repo contents with these files (see "Delete" below).
2. Vercel > Project > Settings > Build and Deployment: Framework Preset = **Other** (or Express), leave all overrides blank.
3. Redeploy. No environment variables are required. Optional: `MESSAGE` (second chat message).

## Routes
- `/` buttons, `/qr.html` QR page, `/pair.html` pair-code page
- `GET /qr` returns the QR as PNG, `GET /code?number=2348012345678` returns `{ "code": "ABCD-EFGH" }`

## Delete from the old repo (if still there)
`Excel.js`, `id.js`, `main.html`, `pair.html` (now in `public/`), the `Temp/` folder.
Also: the old `qr.js`/`pair.js` had a Pastebin API key hard-coded. It is unused now, but it stays in
your Git history, so treat it as exposed.

## How it works
`/qr` and `/code` answer as soon as the first QR/code exists. On Vercel, `waitUntil()` keeps the
function alive (up to 300s) while the phone links, then the ID is sent and the temp folder deleted.

## Safety
The session ID is a password for that WhatsApp account. Use a spare number and don't run the bot
and this site on the same session at once. Unofficial clients can get numbers banned.

## Notes
- Baileys 7 is an ES module, so `session.js` loads it with `import()`. Do not change it back to `require('baileys')`:
  on Vercel's runtime that crashes every route with ERR_REQUIRE_ESM.
- `public/favicon.svg` and `public/favicon.ico` are the site icon.
