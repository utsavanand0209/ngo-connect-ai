/* eslint-disable no-console */
const http = require('http');
const { verifyWebhookSignature, isTimestampFresh } = require('../src/utils/webhookDispatcher');

const PORT = Number(process.env.WEBHOOK_RECEIVER_PORT || 9000);
const PATH = String(process.env.WEBHOOK_RECEIVER_PATH || '/webhooks/ngo-connect');
const WEBHOOK_SECRET = String(process.env.WEBHOOK_SECRET || '').trim();
const MAX_AGE_SECONDS = Number(process.env.WEBHOOK_MAX_AGE_SECONDS || 300);

if (!WEBHOOK_SECRET) {
  console.error('WEBHOOK_SECRET is required for receiver verification.');
  process.exit(1);
}

const seenDeliveryIds = new Map();

const pruneSeenIds = () => {
  const now = Date.now();
  for (const [deliveryId, expiresAt] of seenDeliveryIds.entries()) {
    if (expiresAt <= now) seenDeliveryIds.delete(deliveryId);
  }
};

const markSeenDeliveryId = (deliveryId, ttlMs = 15 * 60 * 1000) => {
  if (!deliveryId) return;
  seenDeliveryIds.set(deliveryId, Date.now() + ttlMs);
};

const alreadySeenDeliveryId = (deliveryId) => {
  if (!deliveryId) return false;
  pruneSeenIds();
  const expiresAt = seenDeliveryIds.get(deliveryId);
  return Boolean(expiresAt && expiresAt > Date.now());
};

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== PATH) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = String(req.headers['x-ngoconnect-signature'] || '');
    const timestamp = String(req.headers['x-ngoconnect-timestamp'] || '');
    const deliveryId = String(req.headers['x-ngoconnect-delivery-id'] || '');

    if (!verifyWebhookSignature(WEBHOOK_SECRET, timestamp, rawBody, signature)) {
      res.statusCode = 401;
      res.end('Invalid signature');
      return;
    }

    if (!isTimestampFresh(timestamp, MAX_AGE_SECONDS)) {
      res.statusCode = 408;
      res.end('Stale webhook timestamp');
      return;
    }

    if (alreadySeenDeliveryId(deliveryId)) {
      res.statusCode = 409;
      res.end('Duplicate delivery id');
      return;
    }
    markSeenDeliveryId(deliveryId);

    const payload = JSON.parse(rawBody || '{}');
    console.log(`[webhook] accepted event=${payload?.event || 'unknown'} delivery=${deliveryId}`);

    // Replace this block with your actual business logic.
    // It should be idempotent because retries are expected.

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.statusCode = 500;
    res.end(`Receiver error: ${err.message || 'unknown'}`);
  }
});

server.listen(PORT, () => {
  console.log(`Webhook receiver listening on http://localhost:${PORT}${PATH}`);
  console.log(`Replay window: ${MAX_AGE_SECONDS}s`);
});
