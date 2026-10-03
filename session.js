// One linking attempt, shared by qr.js and pair.js.
//
// Flow: open a temporary Baileys login -> hand the first QR / pairing code back to the caller ->
// keep running in the background until the phone links -> send the SESSION_ID to the linked
// account's own "Message yourself" chat -> close the socket (never logout) and delete the temp folder.

const fs = require('fs');
const os = require('os');
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
  jidNormalizedUser,
} = require('baileys');

let waitUntil = null;
try { ({ waitUntil } = require('@vercel/functions')); } catch {}

const LIMIT_MS = 280 * 1000;        // whole attempt; Vercel's limit is 300s
const FIRST_MS = 25 * 1000;         // how long we wait for the first QR / code
const MAX_ACTIVE = 15;              // attempts running at once on this instance
const START_LIMIT = 8;              // starts per IP...
const START_WINDOW_MS = 10 * 60 * 1000; // ...per 10 minutes
const MESSAGE = process.env.MESSAGE ||
  "Keep this session ID private. Anyone who has it can control this WhatsApp account.\n\nPaste the long message above into SESSION_ID in your XLICON-MD config.";

const logger = pino({ level: 'silent' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- guard (best effort: counters live in this instance's memory) ----------
const hits = new Map();
let active = 0;

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function allow(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const recent = (hits.get(ip) || []).filter((t) => now - t < START_WINDOW_MS);
  if (recent.length >= START_LIMIT || active >= MAX_ACTIVE) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

// Keeps the Vercel function alive after the HTTP response has been sent.
// Elsewhere (Render, local) the server stays up anyway, so this is a no-op.
function keepAlive(promise) {
  try { if (waitUntil) waitUntil(promise); } catch {}
}

// ---------- the attempt ----------
function startLink({ mode, number }) {
  let resolveFirst, rejectFirst;
  const first = new Promise((res, rej) => { resolveFirst = res; rejectFirst = rej; });
  first.catch(() => {});
  const done = run({ mode, number, resolveFirst, rejectFirst });
  return { first, done };
}

async function run({ mode, number, resolveFirst, rejectFirst }) {
  active++;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-')); // /tmp is the only writable place on Vercel
  let sock = null;
  let over = false;
  let opening = false;
  let asked = false;

  let settle;
  const finished = new Promise((r) => { settle = r; });

  const stop = () => {
    if (!sock) return;
    try { sock.ev.removeAllListeners(); } catch {}
    try { sock.end(undefined); } catch {}   // end(), never logout(): logout would unlink the device
    sock = null;
  };
  const end = (why) => {
    if (over) return;
    over = true;
    rejectFirst(new Error(why)); // no-op if the first QR / code was already handed back
    settle();
  };
  const give = (value) => { clearTimeout(firstTimer); resolveFirst(value); };

  const firstTimer = setTimeout(() => end('no-first'), FIRST_MS);
  const limitTimer = setTimeout(() => end('timeout'), LIMIT_MS);

  const connect = async () => {
    stop(); // after WhatsApp's post-link restart, drop the old socket first
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const fetched = await fetchLatestBaileysVersion().catch(() => ({}));
    const s = makeWASocket({
      version: fetched.version,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    });
    sock = s;
    s.ev.on('creds.update', saveCreds);

    s.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (over || sock !== s) return;

      if (qr && !opening) {
        if (mode === 'qr') {
          give({ qr });
        } else if (!asked) {
          asked = true; // ask once; QR events keep firing underneath
          try {
            const raw = await s.requestPairingCode(number);
            give({ code: raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw });
          } catch {
            end('pair-code');
          }
        }
      }

      if (connection === 'open' && !opening) {
        opening = true;
        try {
          await sleep(4000); // let WhatsApp's last creds updates reach disk
          const raw = fs.readFileSync(path.join(dir, 'creds.json'), 'utf8');
          if (!JSON.parse(raw).me?.id) throw new Error('not registered');
          const sessionId = Buffer.from(raw).toString('base64'); // XLICON-MD decodes this with atob()
          const me = jidNormalizedUser(s.user.id);
          const sent = await s.sendMessage(me, { text: sessionId });
          await s.sendMessage(me, { text: MESSAGE }, { quoted: sent });
          await sleep(1500); // let the messages leave before we close
        } catch (e) {
          console.error('Could not deliver the session:', e?.message);
        }
        end('done');
      }

      if (connection === 'close' && !opening) {
        const status = lastDisconnect?.error?.output?.statusCode;
        if (status === DisconnectReason.restartRequired) {
          connect().catch(() => end('reconnect')); // normal: one reconnect right after the phone links
        } else {
          end(`closed-${status}`);
        }
      }
    });
  };

  try {
    await connect().catch(() => end('connect'));
    await finished;
  } finally {
    clearTimeout(firstTimer);
    clearTimeout(limitTimer);
    stop();
    fs.rmSync(dir, { recursive: true, force: true });
    active--;
  }
}

module.exports = { startLink, allow, keepAlive };
